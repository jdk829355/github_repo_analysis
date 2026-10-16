const mockNormalizeGitHubUrl = jest.fn();
const mockGetUserProfile = jest.fn();
const mockHasUserStarredRepository = jest.fn();

jest.mock('../../lib/utils', () => ({
  normalizeGitHubUrl: mockNormalizeGitHubUrl,
}));

jest.mock('../../services/github-client', () => ({
  getUserProfile: mockGetUserProfile,
  hasUserStarredRepository: mockHasUserStarredRepository,
}));

import { POST } from '../../app/api/verify-star/route';
import { GitHubAPIError, INTERNAL_ERROR_MESSAGE } from '../../lib/errors';
import { logger } from '../../lib/logger';

describe('POST /api/verify-star', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeGitHubUrl.mockReturnValue('https://github.com/testuser');
    mockGetUserProfile.mockResolvedValue({});
    mockHasUserStarredRepository.mockResolvedValue(true);
  });

  function createRequest(body: unknown): Request {
    return new Request('http://localhost/api/verify-star', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns verified true when the user starred the repository', async () => {
    const response = await POST(createRequest({ url: 'testuser' }) as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.verified).toBe(true);
    expect(data.username).toBe('testuser');
  });

  it('returns 403 when the user has not starred the repository', async () => {
    mockHasUserStarredRepository.mockResolvedValue(false);

    const response = await POST(createRequest({ url: 'testuser' }) as any);
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.verified).toBe(false);
  });

  it('returns 404 when the profile does not exist', async () => {
    mockGetUserProfile.mockRejectedValue(
      new GitHubAPIError('Profile not found', 404, '/users/testuser')
    );

    const response = await POST(createRequest({ url: 'testuser' }) as any);
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('GitHub profile not found');
  });

  it('returns 429 with Retry-After when the GitHub rate limit is exceeded', async () => {
    mockHasUserStarredRepository.mockRejectedValue(
      new GitHubAPIError('API rate limit exceeded for user ID 1.', 403, '/users/testuser/starred')
    );

    const response = await POST(createRequest({ url: 'testuser' }) as any);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    const data = await response.json();
    expect(data.error).toBe('GitHub API rate limit exceeded');
  });

  it('returns 429 for a secondary rate limit message regardless of case', async () => {
    mockHasUserStarredRepository.mockRejectedValue(
      new GitHubAPIError(
        'You have exceeded a Secondary Rate Limit. Please wait.',
        403,
        '/users/testuser/starred'
      )
    );

    const response = await POST(createRequest({ url: 'testuser' }) as any);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
  });

  it('returns 502 with a token permission message for non rate limit 403 errors', async () => {
    mockHasUserStarredRepository.mockRejectedValue(
      new GitHubAPIError(
        'Resource not accessible by personal access token',
        403,
        '/users/testuser/starred'
      )
    );

    const loggerError = jest.spyOn(logger, 'error');

    const response = await POST(createRequest({ url: 'testuser' }) as any);
    expect(response.status).toBe(502);
    expect(response.headers.get('Retry-After')).toBeNull();
    const data = await response.json();
    expect(data.error).toContain('GitHub 토큰 권한');
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'api.error', route: '/api/verify-star', status: 502 }),
      'GitHub token is missing a required permission'
    );
  });

  it('returns a fixed message on unexpected errors and logs the original', async () => {
    const original = new Error('REDIS_URL environment variable is not set');
    mockGetUserProfile.mockRejectedValue(original);
    const loggerError = jest.spyOn(logger, 'error');

    const response = await POST(createRequest({ url: 'testuser' }) as any);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe(INTERNAL_ERROR_MESSAGE);
    expect(JSON.stringify(data)).not.toContain('REDIS_URL');
    expect(loggerError).toHaveBeenCalledWith(
      { event: 'api.error', route: '/api/verify-star', status: 500, err: original },
      'API request failed'
    );
  });
});
