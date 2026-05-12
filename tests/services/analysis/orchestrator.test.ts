import { AnalysisError } from '../../../lib/errors';
import { ANALYSIS_TIMEOUT_MS } from '../../../lib/constants';

const mockAnalysisJobsCreate = jest.fn();
const mockAnalysisJobsUpdate = jest.fn();
const mockAnalysisJobsFindFirst = jest.fn();
const mockRepositoriesCreate = jest.fn().mockResolvedValue({ id: 'repo-id' });
const mockRepositoriesDeleteMany = jest.fn();
const mockRepositoryAnalysesCreate = jest.fn().mockResolvedValue({ id: 'analysis-id' });
const mockRepositoryAnalysesDeleteMany = jest.fn();
const mockProfileReportsCreate = jest.fn().mockResolvedValue({ id: 'report-id' });

jest.mock('@prisma/client', () => {
  const mockInstance = {
    analysis_jobs: {
      create: mockAnalysisJobsCreate,
      update: mockAnalysisJobsUpdate,
      findFirst: mockAnalysisJobsFindFirst,
    },
    repositories: {
      create: mockRepositoriesCreate,
      deleteMany: mockRepositoriesDeleteMany,
    },
    repository_analyses: {
      create: mockRepositoryAnalysesCreate,
      deleteMany: mockRepositoryAnalysesDeleteMany,
    },
    profile_reports: {
      create: mockProfileReportsCreate,
    },
  };

  return {
    PrismaClient: jest.fn(() => mockInstance),
  };
});

const mockCheckJobDeduplication = jest.fn();
const mockSetJobActive = jest.fn();
const mockClearJobActive = jest.fn();

jest.mock('../../../services/cache', () => ({
  checkJobDeduplication: mockCheckJobDeduplication,
  setJobActive: mockSetJobActive,
  clearJobActive: mockClearJobActive,
  setJobRepoList: jest.fn().mockResolvedValue(undefined),
  getJobRepoList: jest.fn().mockResolvedValue(null),
}));

const mockGetUserRepositories = jest.fn();
const mockGetUserPinnedRepositories = jest.fn();

jest.mock('../../../services/github-client', () => ({
  getUserRepositories: mockGetUserRepositories,
  getUserPinnedRepositories: mockGetUserPinnedRepositories,
}));

const mockAnalyzeRepositoryPipeline = jest.fn();

jest.mock('../../../services/analysis/repo-analysis', () => ({
  analyzeRepositoryPipeline: mockAnalyzeRepositoryPipeline,
}));

const mockAggregateProfile = jest.fn();

jest.mock('../../../services/analysis/profile-aggregation', () => ({
  aggregateProfile: mockAggregateProfile,
}));

const mockPublishEvent = jest.fn();

jest.mock('../../../workers/analysis-worker', () => ({
  publishEvent: mockPublishEvent,
}));

jest.mock('../../../services/llm-client', () => ({
  analyzeRepository: jest.fn(),
}));

jest.mock('../../../lib/constants', () => ({
  ANALYSIS_TIMEOUT_MS: 50,
}));

jest.mock('../../../lib/utils', () => ({
  truncateToMaxSize: jest.fn((text: string) => text),
  hashUrl: jest.fn((url: string) => `hash_${url}`),
  normalizeGitHubUrl: jest.fn((url: string) => url),
}));

jest.mock('../../../lib/commit-filter', () => ({
  filterCommits: jest.fn((commits: Array<{ message: string }>) => commits),
}));

describe('services/analysis/orchestrator', () => {
  const username = 'testuser';
  const githubUrl = 'https://github.com/testuser';
  const jobId = 'job-123';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    mockAnalysisJobsFindFirst.mockResolvedValue(null);
    mockRepositoriesCreate.mockResolvedValue({ id: 'repo-id' });
    mockRepositoryAnalysesCreate.mockResolvedValue({ id: 'analysis-id' });
    mockProfileReportsCreate.mockResolvedValue({ id: 'report-id' });
  });

  function setupMocks() {
    const { startAnalysis } = require('../../../services/analysis/orchestrator');
    return { startAnalysis };
  }

  describe('deduplication', () => {
    it('returns existing jobId when duplicate active job exists', async () => {
      mockCheckJobDeduplication.mockResolvedValue(jobId);

      const { startAnalysis } = setupMocks();
      const result = await startAnalysis(username, githubUrl);

      expect(result).toBe(jobId);
      expect(mockCheckJobDeduplication).toHaveBeenCalledWith(githubUrl);
      expect(mockAnalysisJobsCreate).not.toHaveBeenCalled();
    });
  });

  describe('happy path', () => {
    it('creates job, processes pinned repos, aggregates, and completes', async () => {
      mockCheckJobDeduplication.mockResolvedValue(null);
      mockAnalysisJobsCreate.mockResolvedValue({ id: jobId });
      mockAnalysisJobsUpdate.mockResolvedValue({ id: jobId });
      mockGetUserPinnedRepositories.mockResolvedValue({
        repositories: [
          { id: 1, name: 'repo-a', full_name: 'testuser/repo-a' },
          { id: 2, name: 'repo-b', full_name: 'testuser/repo-b' },
        ],
        filteredCount: 0,
      });
      mockAnalyzeRepositoryPipeline.mockResolvedValue({
        status: 'COMPLETED',
        analysis: { repositoryName: 'repo-a' },
      });
      mockAggregateProfile.mockResolvedValue({
        overallSummary: 'A skilled developer',
      });

      const { startAnalysis } = setupMocks();
      const result = await startAnalysis(username, githubUrl);

      expect(result).toBe(jobId);
      expect(mockAnalysisJobsCreate).toHaveBeenCalledWith({
        data: { github_profile: githubUrl, status: 'PENDING' },
      });
      expect(mockSetJobActive).toHaveBeenCalledWith(githubUrl, jobId);
      expect(mockAnalysisJobsUpdate).toHaveBeenCalledWith({
        where: { id: jobId },
        data: { status: 'PROCESSING' },
      });
      expect(mockPublishEvent).toHaveBeenCalledWith(
        jobId,
        expect.objectContaining({ type: 'stateChange', state: 'PROCESSING', jobId })
      );
      expect(mockGetUserPinnedRepositories).toHaveBeenCalledWith(username);
      expect(mockGetUserRepositories).not.toHaveBeenCalled();
      expect(mockPublishEvent).toHaveBeenCalledWith(
        jobId,
        expect.objectContaining({ type: 'repo_list', totalRepos: 2, repos: ['repo-a', 'repo-b'], jobId })
      );
      expect(mockAnalyzeRepositoryPipeline).toHaveBeenCalledTimes(2);
      expect(mockAnalyzeRepositoryPipeline).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ jobId, analysisJobId: jobId, username, repoName: 'repo-a' }),
        expect.any(Object)
      );
      expect(mockAnalyzeRepositoryPipeline).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ jobId, analysisJobId: jobId, username, repoName: 'repo-b' }),
        expect.any(Object)
      );
      expect(mockAggregateProfile).toHaveBeenCalledWith(
        { username, jobId },
        expect.any(Object)
      );
      expect(mockAnalysisJobsUpdate).toHaveBeenLastCalledWith({
        where: { id: jobId },
        data: { status: 'COMPLETED', completed_at: expect.any(Date) },
      });
      expect(mockPublishEvent).toHaveBeenCalledWith(
        jobId,
        expect.objectContaining({ type: 'stateChange', state: 'COMPLETED', jobId })
      );
      expect(mockPublishEvent).toHaveBeenLastCalledWith(
        jobId,
        expect.objectContaining({ type: 'job_complete', state: 'COMPLETED', jobId })
      );
      expect(mockClearJobActive).toHaveBeenCalledWith(githubUrl);
    });

    it('reuses cached analyses for still-pinned repos and deletes stale cached repos', async () => {
      mockCheckJobDeduplication.mockResolvedValue(null);
      mockAnalysisJobsCreate.mockResolvedValue({ id: jobId });
      mockAnalysisJobsUpdate.mockResolvedValue({ id: jobId });
      mockGetUserPinnedRepositories.mockResolvedValue({
        repositories: [
          {
            id: 1,
            name: 'repo-a',
            full_name: 'testuser/repo-a',
            language: 'TypeScript',
            stargazers_count: 10,
            forks_count: 1,
            fork: false,
            archived: false,
            updated_at: '2024-01-01T00:00:00Z',
            owner: 'testuser',
          },
          {
            id: 2,
            name: 'repo-c',
            full_name: 'testuser/repo-c',
            language: 'Go',
            stargazers_count: 20,
            forks_count: 2,
            fork: false,
            archived: false,
            updated_at: '2024-02-01T00:00:00Z',
            owner: 'testuser',
          },
        ],
        filteredCount: 0,
      });
      mockAnalysisJobsFindFirst.mockResolvedValue({
        id: 'previous-job',
        repositories: [
          {
            id: 'old-repo-a',
            name: 'repo-a',
            full_name: 'testuser/repo-a',
            description: null,
            primary_language: 'TypeScript',
            stars: 1,
            forks: 0,
            is_fork: false,
            is_archived: false,
            updated_at: new Date('2024-01-01T00:00:00Z'),
            repository_analyses: [
              {
                repository_name: 'repo-a',
                summary: 'cached summary',
                project_type: 'web-app',
                estimated_roles: ['Backend'],
                main_contributions: ['API'],
                tech_stack: ['TypeScript'],
                leadership_signals: [],
                confidence: 0.9,
              },
            ],
          },
          {
            id: 'old-repo-b',
            name: 'repo-b',
            full_name: 'testuser/repo-b',
            description: null,
            primary_language: 'JavaScript',
            stars: 1,
            forks: 0,
            is_fork: false,
            is_archived: false,
            updated_at: new Date('2023-01-01T00:00:00Z'),
            repository_analyses: [
              {
                repository_name: 'repo-b',
                summary: 'stale summary',
                project_type: 'web-app',
                estimated_roles: ['Frontend'],
                main_contributions: ['UI'],
                tech_stack: ['JavaScript'],
                leadership_signals: [],
                confidence: 0.7,
              },
            ],
          },
        ],
      });
      mockAnalyzeRepositoryPipeline.mockResolvedValue({
        status: 'COMPLETED',
        analysis: { repositoryName: 'repo-c' },
      });
      mockAggregateProfile.mockResolvedValue({
        overallSummary: 'A skilled developer',
      });

      const { startAnalysis } = setupMocks();
      await startAnalysis(username, githubUrl);

      expect(mockRepositoryAnalysesDeleteMany).toHaveBeenCalledWith({
        where: { repository_id: { in: ['old-repo-b'] } },
      });
      expect(mockRepositoriesDeleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-repo-b'] } },
      });
      expect(mockRepositoriesCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          analysis_job_id: jobId,
          name: 'repo-a',
          full_name: 'testuser/repo-a',
          description: 'cached summary',
        }),
      });
      expect(mockRepositoryAnalysesCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          repository_id: 'repo-id',
          repository_name: 'repo-a',
          summary: 'cached summary',
        }),
      });
      expect(mockAnalyzeRepositoryPipeline).toHaveBeenCalledTimes(1);
      expect(mockAnalyzeRepositoryPipeline).toHaveBeenCalledWith(
        expect.objectContaining({ repoName: 'repo-c' }),
        expect.any(Object)
      );
      expect(mockPublishEvent).toHaveBeenCalledWith(
        jobId,
        expect.objectContaining({ type: 'repo_analysis_started', repo: 'repo-a' })
      );
      expect(mockPublishEvent).toHaveBeenCalledWith(
        jobId,
        expect.objectContaining({ type: 'repo_analysis_completed', repo: 'repo-a' })
      );
    });

    it('reuses previous profile report when pinned repo full_name and updated_at are unchanged', async () => {
      mockCheckJobDeduplication.mockResolvedValue(null);
      mockAnalysisJobsCreate.mockResolvedValue({ id: jobId });
      mockAnalysisJobsUpdate.mockResolvedValue({ id: jobId });
      mockGetUserPinnedRepositories.mockResolvedValue({
        repositories: [
          {
            id: 1,
            name: 'repo-a',
            full_name: 'testuser/repo-a',
            language: 'TypeScript',
            stargazers_count: 10,
            forks_count: 1,
            fork: false,
            archived: false,
            updated_at: '2024-01-01T00:00:00Z',
            owner: 'testuser',
          },
          {
            id: 2,
            name: 'repo-b',
            full_name: 'testuser/repo-b',
            language: 'Go',
            stargazers_count: 20,
            forks_count: 2,
            fork: false,
            archived: false,
            updated_at: '2024-02-01T00:00:00Z',
            owner: 'testuser',
          },
        ],
        filteredCount: 0,
      });
      mockAnalysisJobsFindFirst.mockResolvedValue({
        id: 'previous-job',
        profile_report: {
          overall_summary: 'cached profile report',
          role_estimation: { primary: 'Backend', secondary: [], recommended: [] },
          engineering_strengths: ['API design'],
          collaboration_patterns: ['Code reviews'],
        },
        repositories: [
          {
            id: 'old-repo-a',
            name: 'repo-a',
            full_name: 'testuser/repo-a',
            description: null,
            primary_language: 'TypeScript',
            stars: 10,
            forks: 1,
            is_fork: false,
            is_archived: false,
            updated_at: new Date('2024-01-01T00:00:00Z'),
            repository_analyses: [
              {
                repository_name: 'repo-a',
                summary: 'repo-a summary',
                project_type: 'web-app',
                estimated_roles: ['Backend'],
                main_contributions: ['API'],
                tech_stack: ['TypeScript'],
                leadership_signals: [],
                confidence: 0.9,
              },
            ],
          },
          {
            id: 'old-repo-b',
            name: 'repo-b',
            full_name: 'testuser/repo-b',
            description: null,
            primary_language: 'Go',
            stars: 20,
            forks: 2,
            is_fork: false,
            is_archived: false,
            updated_at: new Date('2024-02-01T00:00:00Z'),
            repository_analyses: [
              {
                repository_name: 'repo-b',
                summary: 'repo-b summary',
                project_type: 'service',
                estimated_roles: ['Backend'],
                main_contributions: ['Worker'],
                tech_stack: ['Go'],
                leadership_signals: [],
                confidence: 0.8,
              },
            ],
          },
        ],
      });

      const { startAnalysis } = setupMocks();
      await startAnalysis(username, githubUrl);

      expect(mockAnalyzeRepositoryPipeline).not.toHaveBeenCalled();
      expect(mockAggregateProfile).not.toHaveBeenCalled();
      expect(mockProfileReportsCreate).toHaveBeenCalledWith({
        data: {
          analysis_job_id: jobId,
          overall_summary: 'cached profile report',
          role_estimation: { primary: 'Backend', secondary: [], recommended: [] },
          engineering_strengths: ['API design'],
          collaboration_patterns: ['Code reviews'],
        },
      });
      expect(mockPublishEvent).toHaveBeenCalledWith(
        jobId,
        { type: 'aggregation_complete', reused: true }
      );
    });
  });

  describe('zero pinned repos', () => {
    it('marks FAILED and throws when no pinned repositories exist', async () => {
      mockCheckJobDeduplication.mockResolvedValue(null);
      mockAnalysisJobsCreate.mockResolvedValue({ id: jobId });
      mockAnalysisJobsUpdate.mockResolvedValue({ id: jobId });
      mockGetUserPinnedRepositories.mockResolvedValue({
        repositories: [],
        filteredCount: 0,
      });

      const { startAnalysis } = setupMocks();
      await expect(startAnalysis(username, githubUrl)).rejects.toThrow(
        AnalysisError
      );
      await expect(startAnalysis(username, githubUrl)).rejects.toThrow(
        'No pinned repositories found'
      );

      expect(mockAnalysisJobsUpdate).toHaveBeenCalledWith({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          error_message: 'No pinned repositories found',
        },
      });
      expect(mockClearJobActive).toHaveBeenCalledWith(githubUrl);
      expect(mockPublishEvent).toHaveBeenCalledWith(
        jobId,
        expect.objectContaining({
          type: 'stateChange',
          state: 'FAILED',
          jobId,
          error: 'No pinned repositories found',
        })
      );
      expect(mockAnalyzeRepositoryPipeline).not.toHaveBeenCalled();
      expect(mockAggregateProfile).not.toHaveBeenCalled();
    });
  });

  describe('timeout', () => {
    it('fails with timeout when analysis exceeds ANALYSIS_TIMEOUT_MS', async () => {
      mockCheckJobDeduplication.mockResolvedValue(null);
      mockAnalysisJobsCreate.mockResolvedValue({ id: jobId });
      mockAnalysisJobsUpdate.mockResolvedValue({ id: jobId });
      mockGetUserPinnedRepositories.mockResolvedValue({
        repositories: [{ id: 1, name: 'repo-a', full_name: 'testuser/repo-a' }],
        filteredCount: 0,
      });
      mockAnalyzeRepositoryPipeline.mockImplementation(() => new Promise(() => {}));

      const { startAnalysis } = setupMocks();

      await expect(startAnalysis(username, githubUrl)).rejects.toThrow(
        `Analysis timed out after ${ANALYSIS_TIMEOUT_MS}ms`
      );

      expect(mockClearJobActive).toHaveBeenCalledWith(githubUrl);
      expect(mockAnalysisJobsUpdate).toHaveBeenLastCalledWith({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          error_message: `Analysis timed out after ${ANALYSIS_TIMEOUT_MS}ms`,
        },
      });
    });
  });

  describe('error handling', () => {
    it('marks FAILED and clears active on repo analysis error', async () => {
      mockCheckJobDeduplication.mockResolvedValue(null);
      mockAnalysisJobsCreate.mockResolvedValue({ id: jobId });
      mockAnalysisJobsUpdate.mockResolvedValue({ id: jobId });
      mockGetUserPinnedRepositories.mockResolvedValue({
        repositories: [{ id: 1, name: 'repo-a', full_name: 'testuser/repo-a' }],
        filteredCount: 0,
      });
      mockAnalyzeRepositoryPipeline.mockRejectedValue(new Error('LLM failed'));

      const { startAnalysis } = setupMocks();

      await expect(startAnalysis(username, githubUrl)).rejects.toThrow('LLM failed');

      expect(mockAnalysisJobsUpdate).toHaveBeenLastCalledWith({
        where: { id: jobId },
        data: { status: 'FAILED', error_message: 'LLM failed' },
      });
      expect(mockClearJobActive).toHaveBeenCalledWith(githubUrl);
      expect(mockPublishEvent).toHaveBeenCalledWith(
        jobId,
        expect.objectContaining({
          type: 'stateChange',
          state: 'FAILED',
          jobId,
          error: 'LLM failed',
        })
      );
    });

    it('marks FAILED and clears active on aggregation error', async () => {
      mockCheckJobDeduplication.mockResolvedValue(null);
      mockAnalysisJobsCreate.mockResolvedValue({ id: jobId });
      mockAnalysisJobsUpdate.mockResolvedValue({ id: jobId });
      mockGetUserPinnedRepositories.mockResolvedValue({
        repositories: [{ id: 1, name: 'repo-a', full_name: 'testuser/repo-a' }],
        filteredCount: 0,
      });
      mockAnalyzeRepositoryPipeline.mockResolvedValue({
        status: 'COMPLETED',
        analysis: { repositoryName: 'repo-a' },
      });
      mockAggregateProfile.mockRejectedValue(new Error('Aggregation failed'));

      const { startAnalysis } = setupMocks();

      await expect(startAnalysis(username, githubUrl)).rejects.toThrow('Aggregation failed');

      expect(mockAnalysisJobsUpdate).toHaveBeenLastCalledWith({
        where: { id: jobId },
        data: { status: 'FAILED', error_message: 'Aggregation failed' },
      });
      expect(mockClearJobActive).toHaveBeenCalledWith(githubUrl);
    });
  });
});
