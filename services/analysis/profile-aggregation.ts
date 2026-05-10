import { PrismaClient } from '@prisma/client';
import { ProfileReportSchema, type ProfileReport } from '../../schemas/profile-report';
import { RoleSchema } from '../../prompts/types';
import type { ProfileAggregationInput, Role, RepositoryAnalysis } from '../../prompts/types';
import { AnalysisError } from '../../lib/errors';
import { aggregateProfile as aggregateWithLlm } from '../llm-client';
import { setCachedLLMOutput } from '../cache';

type PrismaRepositoriesClient = {
  findMany: (args: {
    where: { analysis_job_id: string };
    select: { id: true };
  }) => Promise<Array<{ id: string }>>;
};

type PrismaRepositoryAnalysesClient = {
  findMany: (args: {
    where: { repository_id: { in: string[] } };
  }) => Promise<Array<{
    repository_name: string;
    summary: string;
    project_type: string;
    estimated_roles: string[];
    main_contributions: string[];
    tech_stack: string[];
    leadership_signals: string[];
    confidence: number;
  }>>;
};

type PrismaProfileReportsClient = {
  create: (args: {
    data: {
      analysis_job_id: string;
      overall_summary: string;
      role_estimation: Record<string, unknown>;
      engineering_strengths: string[];
      collaboration_patterns: string[];
    };
  }) => Promise<{ id: string }>;
};

type PrismaAnalysisJobsClient = {
  update: (args: {
    where: { id: string };
    data: { status: 'FAILED' | 'COMPLETED'; error_message?: string | null };
  }) => Promise<{ id: string }>;
};

export type AggregationDeps = {
  prisma: PrismaClient;
  llmClient: {
    aggregateProfile: typeof aggregateWithLlm;
  };
  cache: {
    setCachedLLMOutput: typeof setCachedLLMOutput;
  };
  publishEvent: (jobId: string, event: Record<string, unknown>) => Promise<void>;
};

const DEFAULT_DEPS: Omit<AggregationDeps, 'prisma'> = {
  llmClient: { aggregateProfile: aggregateWithLlm },
  cache: { setCachedLLMOutput },
  publishEvent: async (jobId, event) => {
    const worker = await import('../../workers/analysis-worker');
    return worker.publishEvent(jobId, event);
  },
};

export async function aggregateProfile(
  input: { username: string; jobId: string },
  deps?: AggregationDeps
): Promise<ProfileReport> {
  if (!deps) {
    throw new Error('Dependencies are required for profile aggregation');
  }
  const resolvedDeps = deps;

  const prisma = resolvedDeps.prisma;
  const llmClient = resolvedDeps.llmClient ?? DEFAULT_DEPS.llmClient;
  const cache = resolvedDeps.cache ?? DEFAULT_DEPS.cache;
  const publishEvent = resolvedDeps.publishEvent ?? DEFAULT_DEPS.publishEvent;

  const repositoriesClient = prisma.repositories as unknown as PrismaRepositoriesClient;
  const repositoryAnalysesClient = prisma.repository_analyses as unknown as PrismaRepositoryAnalysesClient;

  const repositoryIds = await repositoriesClient.findMany({
    where: { analysis_job_id: input.jobId },
    select: { id: true },
  });

  if (repositoryIds.length === 0) {
    await prisma.analysis_jobs.update({
      where: { id: input.jobId },
      data: { status: 'FAILED', error_message: 'no eligible repositories' },
    });
    await publishEvent(input.jobId, {
      type: 'aggregation_failed',
      error: 'no eligible repositories',
    });
    throw new AnalysisError('no eligible repositories', 'aggregate');
  }

  const repoAnalyses = await repositoryAnalysesClient.findMany({
    where: { repository_id: { in: repositoryIds.map((repo) => repo.id) } },
  });

  const completedAnalyses = repoAnalyses.filter((analysis) => analysis.summary.trim().length > 0);

  if (completedAnalyses.length === 0) {
    await prisma.analysis_jobs.update({
      where: { id: input.jobId },
      data: { status: 'FAILED', error_message: 'no eligible repositories' },
    });
    await publishEvent(input.jobId, {
      type: 'aggregation_failed',
      error: 'no eligible repositories',
    });
    throw new AnalysisError('no eligible repositories', 'aggregate');
  }

  const repositoryAnalyses: RepositoryAnalysis[] = completedAnalyses.map((analysis) => ({
    repositoryName: analysis.repository_name,
    summary: analysis.summary,
    projectType: analysis.project_type,
    estimatedRoles: RoleSchema.array().parse(analysis.estimated_roles),
    mainContributions: analysis.main_contributions,
    techStack: analysis.tech_stack,
    leadershipSignals: analysis.leadership_signals,
    confidence: analysis.confidence,
  }));

  const payload: ProfileAggregationInput = {
    username: input.username,
    repositoryAnalyses,
  };

  try {
    const report = await llmClient.aggregateProfile(payload);
    const validated = ProfileReportSchema.parse(report);

    await cache.setCachedLLMOutput(input.username, undefined, validated);

    await prisma.profile_reports.create({
      data: {
        analysis_job_id: input.jobId,
        overall_summary: validated.overallSummary,
        role_estimation: validated.roleEstimation,
        engineering_strengths: validated.engineeringStrengths,
        collaboration_patterns: validated.collaborationPatterns,
      },
    });

    await publishEvent(input.jobId, { type: 'aggregation_complete' });

    return validated;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'aggregation_failed';
    const rawResponse = error instanceof Error && 'rawResponse' in error ? String(error.rawResponse) : undefined;
    const fullError = rawResponse ? `${errorMessage} | RAW: ${rawResponse.substring(0, 500)}` : errorMessage;

    await prisma.analysis_jobs.update({
      where: { id: input.jobId },
      data: { status: 'FAILED', error_message: fullError },
    });

    const existingReport = await prisma.profile_reports.findUnique({
      where: { analysis_job_id: input.jobId },
    });

    const fallbackData = {
      overall_summary: 'aggregation_failed',
      role_estimation: {
        primary: 'Backend',
        secondary: [],
        recommended: [],
      },
      engineering_strengths: completedAnalyses.map((analysis) => analysis.summary),
      collaboration_patterns: [],
    };

    if (existingReport) {
      await prisma.profile_reports.update({
        where: { analysis_job_id: input.jobId },
        data: fallbackData,
      });
    } else {
      await prisma.profile_reports.create({
        data: {
          analysis_job_id: input.jobId,
          ...fallbackData,
        },
      });
    }

    await publishEvent(input.jobId, {
      type: 'aggregation_failed',
      error: fullError,
    });
    throw error;
  }
}
