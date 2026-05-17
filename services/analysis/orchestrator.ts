import { Prisma } from '@prisma/client';
import { ANALYSIS_TIMEOUT_MS } from '../../lib/constants';
import { AnalysisError } from '../../lib/errors';
import { truncateToMaxSize } from '../../lib/utils';
import { filterCommits } from '../../lib/commit-filter';
import { prisma } from '../../lib/prisma';
import * as cache from '../cache';
import { setJobRepoList } from '../cache';
import * as githubClient from '../github-client';
import type { Repository } from '../github-client';
import * as llmClient from '../llm-client';
import { analyzeRepositoryPipeline, type RepoAnalysisDeps } from './repo-analysis';
import { aggregateProfile } from './profile-aggregation';
import { publishEvent } from '../../workers/analysis-worker';

type CachedRepository = {
  id: string;
  name: string;
  full_name: string;
  description: string | null;
  primary_language: string | null;
  stars: number;
  forks: number;
  is_fork: boolean;
  is_archived: boolean;
  updated_at: Date;
  repository_analyses: Array<{
    repository_name: string;
    summary: string;
    project_type: string;
    estimated_roles: string[];
    main_contributions: string[];
    tech_stack: string[];
    leadership_signals: string[];
    confidence: number;
  }>;
};

type CachedProfileReport = {
  overall_summary: string;
  role_estimation: unknown;
  engineering_strengths: string[];
  collaboration_patterns: string[];
  green_flags: string[];
  red_flags: string[];
};

function repoCacheKey(repo: { full_name?: string; name: string }): string {
  return (repo.full_name || repo.name).toLowerCase();
}

function normalizeUpdatedAt(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function buildProfileFingerprint(
  repos: Array<{ full_name?: string; name: string; updated_at: string | Date }>
): string {
  return repos
    .map((repo) => `${repoCacheKey(repo)}@${normalizeUpdatedAt(repo.updated_at)}`)
    .sort()
    .join('|');
}

const githubClientWithGetRepository = {
  ...githubClient,
  getRepository: githubClient.getRepository,
};

function createRepoAnalysisDeps(): RepoAnalysisDeps {
  return {
    githubClient: githubClientWithGetRepository,
    llmClient,
    publishEvent: async (jobId: string, event: Record<string, unknown>) => {
      await publishEvent(jobId, event);
    },
    prisma,
    filterCommits,
    truncateToMaxSize,
  };
}

export async function runAnalysisPipeline(
  username: string,
  githubUrl: string,
  jobId: string
): Promise<void> {
  try {
    await prisma.analysis_jobs.update({
      where: { id: jobId },
      data: { status: 'PROCESSING' },
    });
    await publishEvent(jobId, {
      type: 'stateChange',
      state: 'PROCESSING',
      jobId,
    });

    const { repositories } = await githubClient.getUserPinnedRepositories(username);
    const currentFingerprint = buildProfileFingerprint(repositories);

    if (repositories.length === 0) {
      await prisma.analysis_jobs.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          error_message: 'No pinned repositories found',
        },
      });
      await cache.clearJobActive(githubUrl);
      await publishEvent(jobId, {
        type: 'stateChange',
        state: 'FAILED',
        jobId,
        error: 'No pinned repositories found',
      });
      throw new AnalysisError('No pinned repositories found', 'fetch');
    }

    await setJobRepoList(jobId, repositories.map((r) => r.name));
    await publishEvent(jobId, {
      type: 'repo_list',
      totalRepos: repositories.length,
      repos: repositories.map((r) => r.name),
      jobId,
    });

    const previousJob = await prisma.analysis_jobs.findFirst({
      where: {
        github_profile: githubUrl,
        status: 'COMPLETED',
        id: { not: jobId },
      },
      orderBy: { created_at: 'desc' },
      include: {
        profile_report: true,
        repositories: {
          include: {
            repository_analyses: true,
          },
        },
      },
    });

    const currentRepoKeys = new Set(repositories.map((repo) => repoCacheKey(repo)));
    const currentRepoUpdatedAt = new Map(
      repositories.map((repo) => [repoCacheKey(repo), normalizeUpdatedAt(repo.updated_at)])
    );
    const previousAnalyses = new Map<string, {
      repository: CachedRepository;
      analysis: CachedRepository['repository_analyses'][number];
    }>();
    let canReuseProfileReport = false;
    let previousProfileReport: CachedProfileReport | null = null;

    if (previousJob) {
      const staleRepositoryIds: string[] = [];
      const previousRepositories = previousJob.repositories as CachedRepository[];
      const previousFingerprint = buildProfileFingerprint(previousRepositories);
      previousProfileReport = previousJob.profile_report as CachedProfileReport | null;
      const hasProfileFlagSections = Boolean(
        (previousProfileReport?.green_flags?.length || 0) + (previousProfileReport?.red_flags?.length || 0)
      );
      canReuseProfileReport = Boolean(previousProfileReport)
        && hasProfileFlagSections
        && previousFingerprint === currentFingerprint;

      for (const repo of previousRepositories) {
        const key = repoCacheKey(repo);
        if (!currentRepoKeys.has(key)) {
          staleRepositoryIds.push(repo.id);
          continue;
        }

        const analysis = repo.repository_analyses[0];
        if (analysis && currentRepoUpdatedAt.get(key) === normalizeUpdatedAt(repo.updated_at)) {
          previousAnalyses.set(key, {
            repository: repo,
            analysis: analysis,
          });
        }
      }

      if (staleRepositoryIds.length > 0) {
        await prisma.repository_analyses.deleteMany({
          where: { repository_id: { in: staleRepositoryIds } },
        });
        await prisma.repositories.deleteMany({
          where: { id: { in: staleRepositoryIds } },
        });
      }
    }

    const reposToAnalyze: Repository[] = [];
    for (const repo of repositories) {
      const previous = previousAnalyses.get(repoCacheKey(repo));
      if (previous) {
        const createdRepo = await prisma.repositories.create({
          data: {
            analysis_job_id: jobId,
            name: repo.name,
            full_name: repo.full_name,
            description: previous.analysis.summary,
            primary_language: repo.language,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            is_fork: repo.fork,
            is_archived: repo.archived,
            updated_at: new Date(repo.updated_at),
          },
        });

        await prisma.repository_analyses.create({
          data: {
            repository_id: createdRepo.id,
            repository_name: previous.analysis.repository_name,
            summary: previous.analysis.summary,
            project_type: previous.analysis.project_type,
            estimated_roles: previous.analysis.estimated_roles,
            main_contributions: previous.analysis.main_contributions,
            tech_stack: previous.analysis.tech_stack,
            leadership_signals: previous.analysis.leadership_signals,
            confidence: previous.analysis.confidence,
          },
        });

        await publishEvent(jobId, {
          type: 'repo_analysis_started',
          repo: repo.name,
        });
        await publishEvent(jobId, {
          type: 'repo_analysis_completed',
          repo: repo.name,
          summary: previous.analysis.summary,
        });
      } else {
        reposToAnalyze.push(repo);
      }
    }

    const deps = createRepoAnalysisDeps();

    const analysisWork = async () => {
      for (const repo of reposToAnalyze) {
        await analyzeRepositoryPipeline(
          {
            jobId,
            analysisJobId: jobId,
            username,
            repoName: repo.name,
            owner: repo.owner || username,
          },
          deps
        );
      }

      if (canReuseProfileReport && previousProfileReport) {
        await prisma.profile_reports.create({
          data: {
            analysis_job_id: jobId,
            overall_summary: previousProfileReport.overall_summary,
            role_estimation: previousProfileReport.role_estimation as Prisma.InputJsonValue,
            engineering_strengths: previousProfileReport.engineering_strengths,
            collaboration_patterns: previousProfileReport.collaboration_patterns,
            green_flags: previousProfileReport.green_flags || [],
            red_flags: previousProfileReport.red_flags || [],
          },
        });
        await publishEvent(jobId, { type: 'aggregation_complete', reused: true });
      } else {
        await aggregateProfile(
          { username, jobId },
          {
            prisma,
            llmClient: { aggregateProfile: llmClient.aggregateProfile },
            publishEvent: async (eventJobId, event) => {
              await publishEvent(eventJobId, event);
            },
          }
        );
      }
    };

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new AnalysisError(
            `Analysis timed out after ${ANALYSIS_TIMEOUT_MS}ms`,
            'aggregate'
          )
        );
      }, ANALYSIS_TIMEOUT_MS);
    });

    await Promise.race([analysisWork(), timeoutPromise]);

    await prisma.analysis_jobs.update({
      where: { id: jobId },
      data: { status: 'COMPLETED', completed_at: new Date() },
    });
    await cache.clearJobActive(githubUrl);
    await publishEvent(jobId, {
      type: 'stateChange',
      state: 'COMPLETED',
      jobId,
    });
    await publishEvent(jobId, {
      type: 'job_complete',
      state: 'COMPLETED',
      jobId,
    });
  } catch (error) {
    await prisma.analysis_jobs.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
    await cache.clearJobActive(githubUrl);
    await publishEvent(jobId, {
      type: 'stateChange',
      state: 'FAILED',
      jobId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

export async function startAnalysis(
  username: string,
  githubUrl: string
): Promise<string> {
  const existingJobId = await cache.checkJobDeduplication(githubUrl);
  if (existingJobId) {
    return existingJobId;
  }

  const job = await prisma.analysis_jobs.create({
    data: {
      github_profile: githubUrl,
      status: 'PENDING',
    },
  });

  await cache.setJobActive(githubUrl, job.id);

  await runAnalysisPipeline(username, githubUrl, job.id);

  return job.id;
}
