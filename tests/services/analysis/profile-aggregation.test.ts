import { PrismaClient } from '@prisma/client';
import { AnalysisError } from '../../../lib/errors';
import { ProfileReportSchema } from '../../../schemas/profile-report';

const mockRepositoriesFindMany = jest.fn();
const mockRepositoryAnalysesFindMany = jest.fn();
const mockProfileReportsCreate = jest.fn();
const mockProfileReportsFindUnique = jest.fn();
const mockProfileReportsUpdate = jest.fn();
const mockAnalysisJobsUpdate = jest.fn();
const mockAggregateProfile = jest.fn();
const mockSetCachedLLMOutput = jest.fn();
const mockPublishEvent = jest.fn();

describe('services/analysis/profile-aggregation', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  afterEach(() => {
    delete process.env.REDIS_URL;
  });

  function createDeps() {
    return {
      prisma: {
        repositories: {
          findMany: mockRepositoriesFindMany,
        },
        repository_analyses: {
          findMany: mockRepositoryAnalysesFindMany,
        },
        profile_reports: {
          create: mockProfileReportsCreate,
          findUnique: mockProfileReportsFindUnique,
          update: mockProfileReportsUpdate,
        },
        analysis_jobs: {
          update: mockAnalysisJobsUpdate,
        },
      } as unknown as PrismaClient,
      llmClient: {
        aggregateProfile: mockAggregateProfile,
      },
      cache: {
        setCachedLLMOutput: mockSetCachedLLMOutput,
      },
      publishEvent: mockPublishEvent,
    };
  }

  function createRepoAnalysis(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      repository_name: 'repo-a',
      summary: 'Repo summary',
      project_type: 'web-app',
      estimated_roles: ['Backend'],
      main_contributions: ['Auth'],
      tech_stack: ['TypeScript'],
      leadership_signals: [],
      confidence: 0.8,
      ...overrides,
    };
  }

  function createProfileReport() {
    return {
      overallSummary: 'Strong backend engineer',
      roleEstimation: {
        primary: 'Backend',
        secondary: ['Technical Lead'],
        recommended: ['Senior Backend Engineer'],
      },
      engineeringStrengths: ['API design'],
      collaborationPatterns: ['Code reviews'],
    };
  }

  it('aggregates completed analyses, caches, stores, and publishes event', async () => {
    mockRepositoriesFindMany.mockResolvedValue([{ id: 'repo-1' }]);
    mockRepositoryAnalysesFindMany.mockResolvedValue([
      createRepoAnalysis({ repository_name: 'repo-a' }),
    ]);
    const report = createProfileReport();
    mockAggregateProfile.mockResolvedValue(report);
    mockProfileReportsCreate.mockResolvedValue({ id: 'report-1' });

    const { aggregateProfile } = await import('../../../services/analysis/profile-aggregation');

    const result = await aggregateProfile(
      { username: 'testuser', jobId: 'job-1' },
      createDeps()
    );

    expect(ProfileReportSchema.parse(result)).toEqual(report);
    expect(mockAggregateProfile).toHaveBeenCalledWith({
      username: 'testuser',
      repositoryAnalyses: [
        expect.objectContaining({ repositoryName: 'repo-a' }),
      ],
    });
    expect(mockSetCachedLLMOutput).toHaveBeenCalledWith('testuser', undefined, report);
    expect(mockProfileReportsCreate).toHaveBeenCalledWith({
      data: {
        analysis_job_id: 'job-1',
        overall_summary: report.overallSummary,
        role_estimation: report.roleEstimation,
        engineering_strengths: report.engineeringStrengths,
        collaboration_patterns: report.collaborationPatterns,
      },
    });
    expect(mockPublishEvent).toHaveBeenCalledWith('job-1', { type: 'aggregation_complete' });
  });

  it('fails when no repositories exist for job', async () => {
    mockRepositoriesFindMany.mockResolvedValue([]);
    mockRepositoryAnalysesFindMany.mockResolvedValue([]);

    const { aggregateProfile } = await import('../../../services/analysis/profile-aggregation');

    const promise = aggregateProfile({ username: 'testuser', jobId: 'job-1' }, createDeps());
    await expect(promise).rejects.toMatchObject({
      name: 'AnalysisError',
      message: 'no eligible repositories',
    });
    expect(mockAnalysisJobsUpdate).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: 'FAILED', error_message: 'no eligible repositories' },
    });
    expect(mockPublishEvent).toHaveBeenCalledWith('job-1', {
      type: 'aggregation_failed',
      error: 'no eligible repositories',
    });
    expect(mockAggregateProfile).not.toHaveBeenCalled();
  });

  it('fails when no completed analyses exist', async () => {
    mockRepositoriesFindMany.mockResolvedValue([{ id: 'repo-1' }]);
    mockRepositoryAnalysesFindMany.mockResolvedValue([
      createRepoAnalysis({ summary: '   ' }),
    ]);

    const { aggregateProfile } = await import('../../../services/analysis/profile-aggregation');

    const promise = aggregateProfile({ username: 'testuser', jobId: 'job-1' }, createDeps());
    await expect(promise).rejects.toMatchObject({
      name: 'AnalysisError',
      message: 'no eligible repositories',
    });
    expect(mockAnalysisJobsUpdate).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: 'FAILED', error_message: 'no eligible repositories' },
    });
    expect(mockPublishEvent).toHaveBeenCalledWith('job-1', {
      type: 'aggregation_failed',
      error: 'no eligible repositories',
    });
  });

  it('stores fallback report and publishes failure on LLM error', async () => {
    mockRepositoriesFindMany.mockResolvedValue([{ id: 'repo-1' }]);
    mockRepositoryAnalysesFindMany.mockResolvedValue([
      createRepoAnalysis({ summary: 'Repo summary' }),
    ]);
    mockAggregateProfile.mockRejectedValue(new Error('LLM failed'));

    const { aggregateProfile } = await import('../../../services/analysis/profile-aggregation');

    await expect(
      aggregateProfile({ username: 'testuser', jobId: 'job-1' }, createDeps())
    ).rejects.toThrow('LLM failed');
    expect(mockAnalysisJobsUpdate).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: 'FAILED', error_message: 'LLM failed' },
    });
    expect(mockProfileReportsCreate).toHaveBeenCalledWith({
      data: {
        analysis_job_id: 'job-1',
        overall_summary: 'aggregation_failed',
        role_estimation: {
          primary: 'Backend',
          secondary: [],
          recommended: [],
        },
        engineering_strengths: ['Repo summary'],
        collaboration_patterns: [],
      },
    });
    expect(mockPublishEvent).toHaveBeenCalledWith('job-1', {
      type: 'aggregation_failed',
      error: 'LLM failed',
    });
  });
});
