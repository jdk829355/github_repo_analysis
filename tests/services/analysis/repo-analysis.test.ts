import { PrismaClient } from '@prisma/client';
import { GitHubAPIError } from '../../../lib/errors';
import { RepositoryAnalysisSchema } from '../../../schemas/repository-analysis';
import type { RepositoryAnalysis } from '../../../schemas/repository-analysis';

describe('services/analysis/repo-analysis', () => {
  const mockGetUserRepositories = jest.fn();
  const mockGetRepository = jest.fn();
  const mockGetRepositoryReadme = jest.fn();
  const mockGetRepositoryCommits = jest.fn();
  const mockAnalyzeRepository = jest.fn();
  const mockSetCachedLLMOutput = jest.fn();
  const mockPublishEvent = jest.fn();
  const mockFilterCommits = jest.fn();
  const mockTruncateToMaxSize = jest.fn();
  const mockRepositoriesCreate = jest.fn();
  const mockRepositoryAnalysesCreate = jest.fn();

  const baseRepo = {
    id: 1,
    name: 'sample-repo',
    full_name: 'testuser/sample-repo',
    description: 'Sample repository',
    html_url: 'https://github.com/testuser/sample-repo',
    language: 'TypeScript',
    stargazers_count: 42,
    forks_count: 3,
    open_issues_count: 1,
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2021-01-01T00:00:00Z',
    pushed_at: '2021-02-01T00:00:00Z',
    fork: false,
    archived: false,
    size: 1000,
  };

  const baseCommits = [
    {
      sha: 'sha-1',
      commit: {
        message: 'Add authentication flow',
        author: { date: '2021-01-01T00:00:00Z' },
      },
      author: { login: 'testuser' },
    },
  ];

  const baseAnalysis: RepositoryAnalysis = {
    repositoryName: 'sample-repo',
    summary: 'Sample summary',
    projectType: 'web-app',
    estimatedRoles: ['Backend'],
    mainContributions: ['Auth flow'],
    techStack: ['TypeScript'],
    leadershipSignals: [],
    confidence: 0.8,
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockTruncateToMaxSize.mockImplementation((text: string) => text);
    mockFilterCommits.mockImplementation((commits: Array<{ message: string }>) => commits);
    mockRepositoriesCreate.mockResolvedValue({ id: 'repo-1' });
    mockRepositoryAnalysesCreate.mockResolvedValue({ id: 'analysis-1' });
  });

  function createDeps() {
    return {
      githubClient: {
        getUserRepositories: mockGetUserRepositories,
        getRepository: mockGetRepository,
        getRepositoryReadme: mockGetRepositoryReadme,
        getRepositoryCommits: mockGetRepositoryCommits,
      },
      llmClient: {
        analyzeRepository: mockAnalyzeRepository,
      },
      cache: {
        setCachedLLMOutput: mockSetCachedLLMOutput,
      },
      publishEvent: mockPublishEvent,
      prisma: {
        repositories: {
          create: mockRepositoriesCreate,
        },
        repository_analyses: {
          create: mockRepositoryAnalysesCreate,
        },
      } as unknown as PrismaClient,
      filterCommits: mockFilterCommits,
      truncateToMaxSize: mockTruncateToMaxSize,
    };
  }

  it('runs repo analysis pipeline end-to-end and stores results', async () => {
    mockGetUserRepositories.mockResolvedValue({ repositories: [baseRepo], filteredCount: 0 });
    mockGetRepositoryReadme.mockResolvedValue('# Sample README');
    mockGetRepositoryCommits.mockResolvedValue(baseCommits);
    mockAnalyzeRepository.mockResolvedValue(baseAnalysis);

    const { analyzeRepositoryPipeline } = await import('../../../services/analysis/repo-analysis');

    const result = await analyzeRepositoryPipeline(
      {
        jobId: 'job-1',
        analysisJobId: 'analysis-1',
        username: 'testuser',
        repoName: 'sample-repo',
        owner: 'testuser',
      },
      createDeps()
    );

    expect(result.status).toBe('COMPLETED');
    expect(mockGetRepository).not.toHaveBeenCalled();
    expect(mockAnalyzeRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryName: 'sample-repo',
        readme: '# Sample README',
      })
    );
    if (result.status !== 'COMPLETED') {
      throw new Error('Expected analysis to complete');
    }
    expect(RepositoryAnalysisSchema.parse(result.analysis)).toEqual(baseAnalysis);
    expect(mockSetCachedLLMOutput).toHaveBeenCalledWith('testuser', 'sample-repo', baseAnalysis);
    expect(mockRepositoriesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          analysis_job_id: 'analysis-1',
          name: 'sample-repo',
          full_name: 'testuser/sample-repo',
          description: 'Sample summary',
        }),
      })
    );
    expect(mockRepositoryAnalysesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          repository_id: 'repo-1',
          summary: 'Sample summary',
        }),
      })
    );
    expect(mockPublishEvent).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ type: 'repo_analysis_completed', repo: 'sample-repo' })
    );
  });

  it('continues without README when readme is missing', async () => {
    mockGetUserRepositories.mockResolvedValue({ repositories: [baseRepo], filteredCount: 0 });
    mockGetRepositoryReadme.mockRejectedValue(
      new GitHubAPIError('Not Found', 404, '/repos/testuser/sample-repo/readme')
    );
    mockGetRepositoryCommits.mockResolvedValue(baseCommits);
    mockAnalyzeRepository.mockResolvedValue(baseAnalysis);

    const { analyzeRepositoryPipeline } = await import('../../../services/analysis/repo-analysis');

    const result = await analyzeRepositoryPipeline(
      {
        jobId: 'job-1',
        analysisJobId: 'analysis-1',
        username: 'testuser',
        repoName: 'sample-repo',
        owner: 'testuser',
      },
      createDeps()
    );

    expect(result.status).toBe('COMPLETED');
    expect(mockAnalyzeRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryName: 'sample-repo',
        readme: undefined,
      })
    );
  });

  it('skips analysis when commits are insufficient after filtering', async () => {
    mockGetUserRepositories.mockResolvedValue({ repositories: [baseRepo], filteredCount: 0 });
    mockGetRepositoryReadme.mockResolvedValue('# Sample README');
    mockGetRepositoryCommits.mockResolvedValue(baseCommits);
    mockFilterCommits.mockReturnValue([]);

    const { analyzeRepositoryPipeline } = await import('../../../services/analysis/repo-analysis');

    const result = await analyzeRepositoryPipeline(
      {
        jobId: 'job-1',
        analysisJobId: 'analysis-1',
        username: 'testuser',
        repoName: 'sample-repo',
        owner: 'testuser',
      },
      createDeps()
    );

    expect(result.status).toBe('SKIPPED');
    if (result.status === 'SKIPPED') {
      expect(result.reason).toBe('insufficient commits');
    }
    expect(mockAnalyzeRepository).not.toHaveBeenCalled();
    expect(mockRepositoryAnalysesCreate).not.toHaveBeenCalled();
    expect(mockPublishEvent).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        type: 'repo_analysis_skipped',
        repo: 'sample-repo',
        reason: 'insufficient commits',
      })
    );
  });

  it('marks analysis as failed and publishes failure event on errors', async () => {
    mockGetUserRepositories.mockResolvedValue({ repositories: [baseRepo], filteredCount: 0 });
    mockGetRepositoryReadme.mockResolvedValue('# Sample README');
    mockGetRepositoryCommits.mockResolvedValue(baseCommits);
    mockAnalyzeRepository.mockRejectedValue(new Error('LLM failed'));

    const { analyzeRepositoryPipeline } = await import('../../../services/analysis/repo-analysis');

    const result = await analyzeRepositoryPipeline(
      {
        jobId: 'job-1',
        analysisJobId: 'analysis-1',
        username: 'testuser',
        repoName: 'sample-repo',
        owner: 'testuser',
      },
      createDeps()
    );

    expect(result.status).toBe('FAILED');
    if (result.status === 'FAILED') {
      expect(result.error).toContain('LLM failed');
    }
    expect(mockPublishEvent).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        type: 'repo_analysis_failed',
        repo: 'sample-repo',
      })
    );
  });
});
