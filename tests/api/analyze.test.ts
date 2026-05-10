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

describe('POST /api/analyze', () => {
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

  it('creates new job and returns 202', async () => {
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
