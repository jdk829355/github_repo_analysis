import { AnalysisError } from '../../../lib/errors';
import { ANALYSIS_TIMEOUT_MS } from '../../../lib/constants';

const mockAnalysisJobsCreate = jest.fn();
const mockAnalysisJobsUpdate = jest.fn();
const mockAnalysisJobsFindFirst = jest.fn();

jest.mock('@prisma/client', () => {
  const mockInstance = {
    analysis_jobs: {
      create: mockAnalysisJobsCreate,
      update: mockAnalysisJobsUpdate,
      findFirst: mockAnalysisJobsFindFirst,
    },
    repositories: {
      create: jest.fn().mockResolvedValue({ id: 'repo-id' }),
    },
    repository_analyses: {
      create: jest.fn().mockResolvedValue({ id: 'analysis-id' }),
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
      expect(mockClearJobActive).not.toHaveBeenCalled();
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
