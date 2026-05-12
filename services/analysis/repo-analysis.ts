import { PrismaClient } from '@prisma/client';
import { RepositoryAnalysisSchema } from '../../schemas/repository-analysis';
import type { RepositoryAnalysis } from '../../schemas/repository-analysis';
import { filterCommits as defaultFilterCommits } from '../../lib/commit-filter';
import { truncateToMaxSize as defaultTruncateToMaxSize } from '../../lib/utils';
import { README_MAX_SIZE_BYTES } from '../../lib/constants';
import type { RepositoryAnalysisInput } from '../../prompts/types';
import type { GitHubAPIError } from '../../lib/errors';
import * as githubClient from '../github-client';
import * as llmClient from '../llm-client';

type CommitResponse = {
  sha: string;
  commit: {
    message: string;
    author: {
      date: string;
    };
  };
  author: {
    login: string;
  } | null;
};

type RepositoryResponse = {
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  fork: boolean;
  archived: boolean;
};

type PrismaRepositoriesClient = {
  create: (args: {
    data: {
      analysis_job_id: string;
      name: string;
      full_name: string;
      description?: string | null;
      primary_language?: string | null;
      stars: number;
      forks: number;
      is_fork: boolean;
      is_archived: boolean;
      updated_at: Date;
    };
  }) => Promise<{ id: string }>;
};

type PrismaRepositoryAnalysesClient = {
  create: (args: {
    data: {
      repository_id: string;
      repository_name: string;
      summary: string;
      project_type: string;
      estimated_roles: string[];
      main_contributions: string[];
      tech_stack: string[];
      leadership_signals: string[];
      confidence: number;
    };
  }) => Promise<{ id: string }>;
};

export type RepoAnalysisDeps = {
  githubClient: {
    getUserRepositories: typeof githubClient.getUserRepositories;
    getRepository: typeof githubClient.getRepository;
    getRepositoryReadme: typeof githubClient.getRepositoryReadme;
    getRepositoryCommits: typeof githubClient.getRepositoryCommits;
  };
  llmClient: {
    analyzeRepository: typeof llmClient.analyzeRepository;
  };
  publishEvent: (jobId: string, event: Record<string, unknown>) => Promise<void>;
  prisma: PrismaClient | null;
  filterCommits: typeof defaultFilterCommits;
  truncateToMaxSize: typeof defaultTruncateToMaxSize;
};

export type RepoAnalysisInput = {
  jobId: string;
  analysisJobId: string;
  username: string;
  repoName: string;
  owner: string;
};

export type RepoAnalysisResult =
  | {
      status: 'COMPLETED';
      analysis: RepositoryAnalysis;
    }
  | {
      status: 'SKIPPED';
      reason: 'insufficient commits';
    }
  | {
      status: 'FAILED';
      error: string;
    };

function createDefaultDeps(): RepoAnalysisDeps {
  return {
    githubClient,
    llmClient,
    publishEvent: async (jobId: string, event: Record<string, unknown>) => {
      const worker = await import('../../workers/analysis-worker');
      return worker.publishEvent(jobId, event);
    },
    prisma: null,
    filterCommits: defaultFilterCommits,
    truncateToMaxSize: defaultTruncateToMaxSize,
  };
}

function isNotFoundReadme(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && (error as GitHubAPIError).name === 'GitHubAPIError'
    && 'statusCode' in error
    && (error as GitHubAPIError).statusCode === 404;
}

function buildCommitLogs(
  commits: CommitResponse[],
  filtered: Array<{ sha?: string; message: string }>
): Array<{ message: string; date: string; author: string }> {
  const allowedShas = new Set(filtered.map((commit) => commit.sha).filter(Boolean));
  return commits
    .filter((commit) => allowedShas.has(commit.sha))
    .map((commit) => ({
      message: commit.commit.message,
      date: commit.commit.author.date,
      author: commit.author?.login || 'unknown',
    }));
}

function resolveRepository(
  repositories: RepositoryResponse[],
  repoName: string
): RepositoryResponse | undefined {
  return repositories.find((repo) => repo.name === repoName || repo.full_name.endsWith(`/${repoName}`));
}

export async function analyzeRepositoryPipeline(
  input: RepoAnalysisInput,
  deps: RepoAnalysisDeps = createDefaultDeps()
): Promise<RepoAnalysisResult> {
  const { jobId, analysisJobId, username, repoName, owner } = input;

  if (!deps.prisma) {
    throw new Error('Prisma client is required for repository analysis pipeline');
  }

  try {
    await deps.publishEvent(jobId, {
      type: 'repo_analysis_started',
      repo: repoName,
    });

    const { repositories } = await deps.githubClient.getUserRepositories(username);
    let repository = resolveRepository(repositories as RepositoryResponse[], repoName);

    if (!repository) {
      repository = await deps.githubClient.getRepository(owner, repoName) as RepositoryResponse;
    }

    let readme: string | undefined;
    try {
      const fetchedReadme = await deps.githubClient.getRepositoryReadme(owner, repoName);
      if (fetchedReadme) {
        readme = deps.truncateToMaxSize(fetchedReadme, README_MAX_SIZE_BYTES);
      }
    } catch (error) {
      if (!isNotFoundReadme(error)) {
        throw error;
      }
    }

    const commits = await deps.githubClient.getRepositoryCommits(owner, repoName, username);
    const filteredCommits = deps.filterCommits(
      commits.map((commit) => ({
        sha: commit.sha,
        message: commit.commit.message,
      }))
    );

    const commitLogs = buildCommitLogs(commits as CommitResponse[], filteredCommits);
    if (commitLogs.length === 0) {
      await deps.publishEvent(jobId, {
        type: 'repo_analysis_skipped',
        repo: repoName,
        reason: 'insufficient commits',
      });
      return { status: 'SKIPPED', reason: 'insufficient commits' };
    }

    const analysisInput: RepositoryAnalysisInput = {
      repositoryName: repository.name,
      description: repository.description ?? undefined,
      primaryLanguage: repository.language ?? undefined,
      stars: repository.stargazers_count,
      forks: repository.forks_count,
      readme,
      commitLogs,
    };

    const analysis = await deps.llmClient.analyzeRepository(analysisInput);
    const validated = RepositoryAnalysisSchema.parse(analysis);

    const createdRepo = await deps.prisma.repositories.create({
      data: {
        analysis_job_id: analysisJobId,
        name: repository.name,
        full_name: repository.full_name,
        description: validated.summary,
        primary_language: repository.language,
        stars: repository.stargazers_count,
        forks: repository.forks_count,
        is_fork: repository.fork,
        is_archived: repository.archived,
        updated_at: new Date(repository.updated_at),
      },
    });

    await deps.prisma.repository_analyses.create({
      data: {
        repository_id: createdRepo.id,
        repository_name: validated.repositoryName,
        summary: validated.summary,
        project_type: validated.projectType,
        estimated_roles: validated.estimatedRoles,
        main_contributions: validated.mainContributions,
        tech_stack: validated.techStack,
        leadership_signals: validated.leadershipSignals,
        confidence: validated.confidence,
      },
    });

    await deps.publishEvent(jobId, {
      type: 'repo_analysis_completed',
      repo: repoName,
      summary: validated.summary,
    });

    return { status: 'COMPLETED', analysis: validated };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await deps.publishEvent(jobId, {
      type: 'repo_analysis_failed',
      repo: repoName,
      error: message,
    });
    return { status: 'FAILED', error: message };
  }
}
