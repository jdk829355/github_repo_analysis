const mockNormalizeGitHubUrl = jest.fn();
const mockCheckJobDeduplication = jest.fn();
const mockSetJobActive = jest.fn();
const mockAnalysisQueueAdd = jest.fn();
const mockGetUserProfile = jest.fn();

jest.mock('../../lib/utils', () => ({
  normalizeGitHubUrl: mockNormalizeGitHubUrl,
}));

jest.mock('../../services/github-client', () => ({
  getUserProfile: mockGetUserProfile,
}));

jest.mock('../../services/cache', () => ({
  checkJobDeduplication: mockCheckJobDeduplication,
  setJobActive: mockSetJobActive,
}));

jest.mock('../../workers/analysis-worker', () => ({
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
import { GitHubAPIError } from '../../lib/errors';

describe('POST /api/analyze error handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('returns 400 for invalid GitHub URL format', async () => {
    mockNormalizeGitHubUrl.mockImplementation(() => {
      throw new Error('Invalid GitHub URL format');
    });

    const request = createRequest({ url: 'not-a-url' });
    const response = await POST(request as any);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid GitHub URL format');
  });

  it('returns 404 for nonexistent GitHub profile', async () => {
    const githubUrl = 'https://github.com/nonexistent-user-12345';
    mockNormalizeGitHubUrl.mockReturnValue(githubUrl);
    mockGetUserProfile.mockRejectedValue(
      new GitHubAPIError('Profile not found', 404, '/users/nonexistent-user-12345')
    );

    const request = createRequest({ url: 'nonexistent-user-12345' });
    const response = await POST(request as any);
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('GitHub profile not found');
  });

  it('returns 429 when GitHub API rate limit is exceeded', async () => {
    const githubUrl = 'https://github.com/testuser';
    mockNormalizeGitHubUrl.mockReturnValue(githubUrl);
    mockGetUserProfile.mockRejectedValue(
      new GitHubAPIError('API rate limit exceeded', 403, '/users/testuser')
    );

    const request = createRequest({ url: 'testuser' });
    const response = await POST(request as any);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    const data = await response.json();
    expect(data.error).toBe('GitHub API rate limit exceeded');
  });

  it('returns 500 for unexpected GitHub API server errors', async () => {
    const githubUrl = 'https://github.com/testuser';
    mockNormalizeGitHubUrl.mockReturnValue(githubUrl);
    mockGetUserProfile.mockRejectedValue(
      new GitHubAPIError('Internal Server Error', 500, '/users/testuser')
    );

    const request = createRequest({ url: 'testuser' });
    const response = await POST(request as any);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Internal Server Error');
  });

  it('returns 500 for unhandled errors during processing', async () => {
    const githubUrl = 'https://github.com/testuser';
    mockNormalizeGitHubUrl.mockReturnValue(githubUrl);
    mockGetUserProfile.mockResolvedValue({});
    mockCheckJobDeduplication.mockRejectedValue(new Error('Database connection failed'));

    const request = createRequest({ url: 'testuser' });
    const response = await POST(request as any);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Database connection failed');
  });

  it('returns existing job when duplicate is found', async () => {
    const githubUrl = 'https://github.com/testuser';
    mockNormalizeGitHubUrl.mockReturnValue(githubUrl);
    mockGetUserProfile.mockResolvedValue({ login: 'testuser' });
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
  });

  it('creates new job and returns 202 on success', async () => {
    const githubUrl = 'https://github.com/testuser';
    mockNormalizeGitHubUrl.mockReturnValue(githubUrl);
    mockGetUserProfile.mockResolvedValue({ login: 'testuser' });
    mockCheckJobDeduplication.mockResolvedValue(null);
    mockAnalysisJobsCreate.mockResolvedValue({
      id: 'new-job-456',
      status: 'PENDING',
    });

    const request = createRequest({ url: 'testuser' });
    const response = await POST(request as any);
    expect(response.status).toBe(202);
    const data = await response.json();
    expect(data).toEqual({ jobId: 'new-job-456', status: 'PENDING' });
    expect(mockSetJobActive).toHaveBeenCalledWith(githubUrl, 'new-job-456');
    expect(mockAnalysisQueueAdd).toHaveBeenCalledWith(
      'analyze',
      { username: 'testuser', githubUrl: 'https://github.com/testuser' },
      { jobId: 'new-job-456' }
    );
  });
});
