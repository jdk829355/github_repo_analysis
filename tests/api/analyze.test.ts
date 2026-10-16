const mockNormalizeGitHubUrl = jest.fn();
const mockCheckJobDeduplication = jest.fn();
const mockAcquireJobActive = jest.fn();
const mockReleaseJobActive = jest.fn();
const mockAnalysisQueueAdd = jest.fn();
const mockGetUserProfile = jest.fn();
const mockHasUserStarredRepository = jest.fn();

jest.mock('../../lib/utils', () => ({
  normalizeGitHubUrl: mockNormalizeGitHubUrl,
}));

jest.mock('../../services/github-client', () => ({
  getUserProfile: mockGetUserProfile,
  hasUserStarredRepository: mockHasUserStarredRepository,
}));

jest.mock('../../services/cache', () => ({
  checkJobDeduplication: mockCheckJobDeduplication,
  acquireJobActive: mockAcquireJobActive,
  releaseJobActive: mockReleaseJobActive,
}));

jest.mock('../../lib/queue', () => ({
  analysisQueue: {
    add: mockAnalysisQueueAdd,
  },
}));

const mockAnalysisJobsCreate = jest.fn();
const mockAnalysisJobsFindUnique = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    analysis_jobs: {
      create: mockAnalysisJobsCreate,
      findUnique: mockAnalysisJobsFindUnique,
    },
  })),
}));

import { POST } from '../../app/api/analyze/route';
import { INTERNAL_ERROR_MESSAGE } from '../../lib/errors';
import { logger } from '../../lib/logger';

describe('POST /api/analyze', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasUserStarredRepository.mockResolvedValue(true);
    mockAcquireJobActive.mockReset().mockResolvedValue(true);
    mockCheckJobDeduplication.mockReset().mockResolvedValue(null);
    mockAnalysisQueueAdd.mockReset().mockResolvedValue(undefined);
    mockAnalysisJobsCreate
      .mockReset()
      .mockImplementation(async ({ data }: { data: { id: string } }) => ({
        id: data.id,
        status: 'PENDING',
      }));
  });

  function createRequest(body: unknown): Request {
    return new Request('http://localhost/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 400 when URL is missing', async () => {
    const request = createRequest({});
    const response = await POST(request as any);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('URL is required');
  });

  it('returns 400 for invalid GitHub URL', async () => {
    mockNormalizeGitHubUrl.mockImplementation(() => {
      throw new Error('Invalid GitHub URL format');
    });

    const request = createRequest({ url: 'not-a-url' });
    const response = await POST(request as any);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid GitHub URL format');
  });

  it('returns existing job when duplicate is found', async () => {
    const githubUrl = 'https://github.com/testuser';
    mockNormalizeGitHubUrl.mockReturnValue(githubUrl);
    mockGetUserProfile.mockResolvedValue({ login: 'testuser' });
    mockAcquireJobActive.mockResolvedValue(false);
    mockCheckJobDeduplication.mockResolvedValue('existing-job-123');
    mockAnalysisJobsFindUnique.mockResolvedValue({
      id: 'existing-job-123',
      status: 'PROCESSING',
    });

    const request = createRequest({ url: 'testuser' });
    const response = await POST(request as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ jobId: 'existing-job-123', status: 'PROCESSING' });
    expect(mockCheckJobDeduplication).toHaveBeenCalledWith(githubUrl);
    expect(mockAnalysisJobsCreate).not.toHaveBeenCalled();
    expect(mockAnalysisQueueAdd).not.toHaveBeenCalled();
  });

  it('returns the key holder as PENDING when its DB row is not created yet', async () => {
    const githubUrl = 'https://github.com/testuser';
    mockNormalizeGitHubUrl.mockReturnValue(githubUrl);
    mockGetUserProfile.mockResolvedValue({ login: 'testuser' });
    mockAcquireJobActive.mockResolvedValue(false);
    mockCheckJobDeduplication.mockResolvedValue('racing-job-123');
    mockAnalysisJobsFindUnique.mockResolvedValue(null);

    const response = await POST(createRequest({ url: 'testuser' }) as any);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jobId: 'racing-job-123', status: 'PENDING' });
    expect(mockReleaseJobActive).not.toHaveBeenCalled();
    expect(mockAnalysisJobsCreate).not.toHaveBeenCalled();
  });

  it('ignores stale completed dedupe job and creates a new job', async () => {
    const githubUrl = 'https://github.com/testuser';
    mockNormalizeGitHubUrl.mockReturnValue(githubUrl);
    mockGetUserProfile.mockResolvedValue({ login: 'testuser' });
    mockAcquireJobActive.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockCheckJobDeduplication.mockResolvedValue('completed-job-123');
    mockAnalysisJobsFindUnique.mockResolvedValue({
      id: 'completed-job-123',
      status: 'COMPLETED',
    });

    const request = createRequest({ url: 'testuser' });
    const response = await POST(request as any);
    expect(response.status).toBe(202);
    const data = await response.json();
    expect(data.status).toBe('PENDING');
    expect(data.jobId).not.toBe('completed-job-123');
    expect(mockReleaseJobActive).toHaveBeenCalledWith(githubUrl, 'completed-job-123');
    expect(mockAcquireJobActive).toHaveBeenCalledTimes(2);
    expect(mockAcquireJobActive).toHaveBeenLastCalledWith(githubUrl, data.jobId);
    expect(mockAnalysisQueueAdd).toHaveBeenCalledWith(
      'analyze',
      { username: 'testuser', githubUrl },
      { jobId: data.jobId }
    );
  });

  it('returns the winner when the retry acquire also loses the race', async () => {
    const githubUrl = 'https://github.com/testuser';
    mockNormalizeGitHubUrl.mockReturnValue(githubUrl);
    mockGetUserProfile.mockResolvedValue({ login: 'testuser' });
    mockAcquireJobActive.mockResolvedValue(false);
    mockCheckJobDeduplication
      .mockResolvedValueOnce('completed-job-123')
      .mockResolvedValueOnce('winner-job-789');
    mockAnalysisJobsFindUnique.mockResolvedValue({
      id: 'completed-job-123',
      status: 'COMPLETED',
    });

    const response = await POST(createRequest({ url: 'testuser' }) as any);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jobId: 'winner-job-789', status: 'PENDING' });
    expect(mockAnalysisJobsCreate).not.toHaveBeenCalled();
  });

  it('returns 403 when verification repository is not starred', async () => {
    const githubUrl = 'https://github.com/testuser';
    mockNormalizeGitHubUrl.mockReturnValue(githubUrl);
    mockGetUserProfile.mockResolvedValue({ login: 'testuser' });
    mockHasUserStarredRepository.mockResolvedValue(false);

    const request = createRequest({ url: 'testuser' });
    const response = await POST(request as any);
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('star');
    expect(mockCheckJobDeduplication).not.toHaveBeenCalled();
    expect(mockAnalysisQueueAdd).not.toHaveBeenCalled();
  });

  it('creates new job and returns 202', async () => {
    const githubUrl = 'https://github.com/testuser';
    mockNormalizeGitHubUrl.mockReturnValue(githubUrl);
    mockGetUserProfile.mockResolvedValue({ login: 'testuser' });

    const request = createRequest({ url: 'testuser' });
    const response = await POST(request as any);
    expect(response.status).toBe(202);
    const data = await response.json();
    expect(data.status).toBe('PENDING');
    expect(mockAcquireJobActive).toHaveBeenCalledWith(githubUrl, data.jobId);
    expect(mockAnalysisJobsCreate).toHaveBeenCalledWith({
      data: { id: data.jobId, github_profile: githubUrl, status: 'PENDING' },
    });
    expect(mockAnalysisQueueAdd).toHaveBeenCalledWith(
      'analyze',
      { username: 'testuser', githubUrl: 'https://github.com/testuser' },
      { jobId: data.jobId }
    );
    expect(mockReleaseJobActive).not.toHaveBeenCalled();
  });

  it('creates only one job when two requests for the same profile arrive concurrently', async () => {
    const githubUrl = 'https://github.com/testuser';
    mockNormalizeGitHubUrl.mockReturnValue(githubUrl);
    mockGetUserProfile.mockResolvedValue({ login: 'testuser' });

    // Redis의 SET NX 동작을 흉내 낸다: 먼저 호출한 쪽만 키를 얻는다.
    let holder: string | null = null;
    mockAcquireJobActive.mockImplementation(async (_url: string, id: string) => {
      if (holder) return false;
      holder = id;
      return true;
    });
    mockCheckJobDeduplication.mockImplementation(async () => holder);
    mockAnalysisJobsFindUnique.mockImplementation(async () => ({
      id: holder,
      status: 'PENDING',
    }));

    const [first, second] = await Promise.all([
      POST(createRequest({ url: 'testuser' }) as any),
      POST(createRequest({ url: 'testuser' }) as any),
    ]);
    const [firstData, secondData] = await Promise.all([first.json(), second.json()]);

    expect(firstData.jobId).toBe(secondData.jobId);
    expect(firstData.jobId).toBe(holder);
    expect([first.status, second.status].sort()).toEqual([200, 202]);
    expect(mockAnalysisJobsCreate).toHaveBeenCalledTimes(1);
    expect(mockAnalysisQueueAdd).toHaveBeenCalledTimes(1);
  });

  it('releases the key and rethrows when queue.add fails, so the next request creates a new job', async () => {
    const githubUrl = 'https://github.com/testuser';
    mockNormalizeGitHubUrl.mockReturnValue(githubUrl);
    mockGetUserProfile.mockResolvedValue({ login: 'testuser' });
    mockAnalysisQueueAdd.mockRejectedValueOnce(new Error('queue down'));
    const loggerError = jest.spyOn(logger, 'error');

    const failed = await POST(createRequest({ url: 'testuser' }) as any);
    expect(failed.status).toBe(500);
    expect((await failed.json()).error).toBe(INTERNAL_ERROR_MESSAGE);
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'api.error', route: '/api/analyze', status: 500 }),
      'API request failed'
    );
    const failedJobId = mockAcquireJobActive.mock.calls[0][1];
    expect(mockReleaseJobActive).toHaveBeenCalledWith(githubUrl, failedJobId);

    const retried = await POST(createRequest({ url: 'testuser' }) as any);
    expect(retried.status).toBe(202);
    const retriedData = await retried.json();
    expect(retriedData.jobId).not.toBe(failedJobId);
    expect(mockAnalysisJobsCreate).toHaveBeenCalledTimes(2);
  });

  it('releases the key and rethrows when the DB insert fails', async () => {
    const githubUrl = 'https://github.com/testuser';
    mockNormalizeGitHubUrl.mockReturnValue(githubUrl);
    mockGetUserProfile.mockResolvedValue({ login: 'testuser' });
    mockAnalysisJobsCreate.mockRejectedValueOnce(new Error('db down'));

    const response = await POST(createRequest({ url: 'testuser' }) as any);
    expect(response.status).toBe(500);
    expect(mockReleaseJobActive).toHaveBeenCalledWith(
      githubUrl,
      mockAcquireJobActive.mock.calls[0][1]
    );
    expect(mockAnalysisQueueAdd).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = new Request('http://localhost/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });

    const response = await POST(request as any);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid JSON body');
  });
});
