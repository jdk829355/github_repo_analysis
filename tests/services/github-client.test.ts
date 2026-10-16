import {
  getUserProfile,
  getUserRepositories,
  getRepositoryReadme,
  getRepositoryCommits,
  hasUserStarredRepository,
  getUserPinnedRepositories,
} from '../../services/github-client';
import { GitHubAPIError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { MAX_REPOS, MAX_COMMITS_PER_REPO, GITHUB_API_VERSION } from '../../lib/constants';

describe('services/github-client', () => {
  const mockFetch = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof global.fetch;
    process.env.GITHUB_TOKEN = 'test-token';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function createMockResponse(
    status: number,
    data: unknown,
    headers: Record<string, string> = {}
  ): Response {
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: {
        get: (name: string) => headers[name] || null,
      },
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
    } as unknown as Response;
  }

  describe('getUserProfile', () => {
    it('should fetch user profile successfully', async () => {
      const mockData = {
        login: 'testuser',
        name: 'Test User',
        bio: 'A developer',
        public_repos: 10,
        followers: 5,
        following: 3,
        html_url: 'https://github.com/testuser',
        avatar_url: 'https://avatars.githubusercontent.com/u/123',
        created_at: '2020-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, mockData, {
          'x-ratelimit-remaining': '4999',
        })
      );

      const result = await getUserProfile('testuser');

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/users/testuser',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': GITHUB_API_VERSION,
          }),
        })
      );
    });

    it('should throw GitHubAPIError with "Profile not found" message for 404', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(404, { message: 'Not Found' }, {
          'x-ratelimit-remaining': '4999',
        })
      );

      await expect(getUserProfile('nonexistent')).rejects.toThrow(GitHubAPIError);
      await expect(getUserProfile('nonexistent')).rejects.toThrow('Profile not found');
    });

    it('should retry on 403 rate limit and succeed if retry works', async () => {
      const mockData = {
        login: 'testuser',
        name: 'Test User',
        bio: 'A developer',
        public_repos: 10,
        followers: 5,
        following: 3,
        html_url: 'https://github.com/testuser',
        avatar_url: 'https://avatars.githubusercontent.com/u/123',
        created_at: '2020-01-01T00:00:00Z',
      };

      mockFetch
        .mockResolvedValueOnce(
          createMockResponse(403, { message: 'API rate limit exceeded' }, {
            'x-ratelimit-remaining': '0',
          })
        )
        .mockResolvedValueOnce(
          createMockResponse(200, mockData, {
            'x-ratelimit-remaining': '4999',
          })
        );

      const result = await getUserProfile('testuser');
      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 500 and succeed if retry works', async () => {
      const mockData = {
        login: 'testuser',
        name: 'Test User',
        bio: 'A developer',
        public_repos: 10,
        followers: 5,
        following: 3,
        html_url: 'https://github.com/testuser',
        avatar_url: 'https://avatars.githubusercontent.com/u/123',
        created_at: '2020-01-01T00:00:00Z',
      };

      mockFetch
        .mockResolvedValueOnce(
          createMockResponse(500, { message: 'Internal Server Error' }, {
            'x-ratelimit-remaining': '4999',
          })
        )
        .mockResolvedValueOnce(
          createMockResponse(200, mockData, {
            'x-ratelimit-remaining': '4999',
          })
        );

      const result = await getUserProfile('testuser');
      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries (3) exceeded', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(500, { message: 'Internal Server Error' }, {
          'x-ratelimit-remaining': '4999',
        })
      );

      await expect(getUserProfile('testuser')).rejects.toThrow(GitHubAPIError);
      expect(mockFetch).toHaveBeenCalledTimes(4); // initial + 3 retries
    });

    it('should use exponential backoff between retries', async () => {
      const mockData = {
        login: 'testuser',
        name: 'Test User',
        bio: 'A developer',
        public_repos: 10,
        followers: 5,
        following: 3,
        html_url: 'https://github.com/testuser',
        avatar_url: 'https://avatars.githubusercontent.com/u/123',
        created_at: '2020-01-01T00:00:00Z',
      };

      mockFetch
        .mockResolvedValueOnce(
          createMockResponse(500, { message: 'Internal Server Error' }, {
            'x-ratelimit-remaining': '4999',
          })
        )
        .mockResolvedValueOnce(
          createMockResponse(500, { message: 'Internal Server Error' }, {
            'x-ratelimit-remaining': '4999',
          })
        )
        .mockResolvedValueOnce(
          createMockResponse(200, mockData, {
            'x-ratelimit-remaining': '4999',
          })
        );

      const startTime = Date.now();
      const result = await getUserProfile('testuser');
      const elapsed = Date.now() - startTime;

      expect(result).toEqual(mockData);
      // Exponential backoff: 1st retry ~100ms, 2nd retry ~200ms
      expect(elapsed).toBeGreaterThanOrEqual(250);
    });
  });

  describe('hasUserStarredRepository', () => {
    const starred = (fullName: string) => ({ full_name: fullName });

    it('should return true when the repository is in the user starred list', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, [starred('other/project'), starred('owner/repo')], {
          'x-ratelimit-remaining': '4999',
        })
      );

      const result = await hasUserStarredRepository('testuser', 'owner', 'repo');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/users/testuser/starred?per_page=100&page=1',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': GITHUB_API_VERSION,
          }),
        })
      );
    });

    it('should return false when the repository is not in the starred list', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, [starred('other/project')], {
          'x-ratelimit-remaining': '4999',
        })
      );

      await expect(hasUserStarredRepository('testuser', 'owner', 'repo')).resolves.toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should continue to the next starred page when needed', async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse(200, Array.from({ length: 100 }, (_, index) => starred(`other/repo-${index}`)), {
            'x-ratelimit-remaining': '4999',
          })
        )
        .mockResolvedValueOnce(
          createMockResponse(200, [starred('owner/repo')], {
            'x-ratelimit-remaining': '4999',
          })
        );

      await expect(hasUserStarredRepository('testuser', 'owner', 'repo')).resolves.toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://api.github.com/users/testuser/starred?per_page=100&page=2',
        expect.any(Object)
      );
    });

    it('should return false after the last full page when the last page is empty', async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse(200, Array.from({ length: 100 }, (_, index) => starred(`other/repo-${index}`)), {
            'x-ratelimit-remaining': '4999',
          })
        )
        .mockResolvedValueOnce(createMockResponse(200, [], { 'x-ratelimit-remaining': '4998' }));

      await expect(hasUserStarredRepository('testuser', 'owner', 'repo')).resolves.toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should match owner/repo case-insensitively', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, [starred('Owner/Repo')], {
          'x-ratelimit-remaining': '4999',
        })
      );

      await expect(hasUserStarredRepository('testuser', 'owner', 'repo')).resolves.toBe(true);
    });

    it('should not treat a repository with a matching suffix or prefix as a match', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, [starred('other/repo'), starred('owner/repo-fork')], {
          'x-ratelimit-remaining': '4999',
        })
      );

      await expect(hasUserStarredRepository('testuser', 'owner', 'repo')).resolves.toBe(false);
    });
  });

  describe('getUserRepositories', () => {
    it('should fetch repositories with pagination', async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `repo-${i}`,
        full_name: `testuser/repo-${i}`,
        description: `Description ${i}`,
        html_url: `https://github.com/testuser/repo-${i}`,
        language: 'TypeScript',
        stargazers_count: i,
        forks_count: i,
        open_issues_count: i,
        created_at: '2020-01-01T00:00:00Z',
        updated_at: '2021-01-01T00:00:00Z',
        pushed_at: '2021-06-01T00:00:00Z',
        fork: false,
        archived: false,
        size: 1000,
      }));

      const page2 = Array.from({ length: 10 }, (_, i) => ({
        id: 100 + i,
        name: `repo-${100 + i}`,
        full_name: `testuser/repo-${100 + i}`,
        description: `Description ${100 + i}`,
        html_url: `https://github.com/testuser/repo-${100 + i}`,
        language: 'TypeScript',
        stargazers_count: i,
        forks_count: i,
        open_issues_count: i,
        created_at: '2020-01-01T00:00:00Z',
        updated_at: '2021-01-01T00:00:00Z',
        pushed_at: '2021-06-01T00:00:00Z',
        fork: false,
        archived: false,
        size: 1000,
      }));

      mockFetch
        .mockResolvedValueOnce(
          createMockResponse(200, page1, {
            'x-ratelimit-remaining': '4999',
          })
        )
        .mockResolvedValueOnce(
          createMockResponse(200, page2, {
            'x-ratelimit-remaining': '4999',
          })
        );

      const result = await getUserRepositories('testuser');

      expect(result.repositories).toHaveLength(MAX_REPOS);
      expect(result.filteredCount).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toContain('per_page=100');
      expect(mockFetch.mock.calls[0][0]).toContain('page=1');
    });

    it('should filter out fork, archived, and empty repositories', async () => {
      const repos = [
        {
          id: 1,
          name: 'normal-repo',
          full_name: 'testuser/normal-repo',
          description: 'Normal repo',
          html_url: 'https://github.com/testuser/normal-repo',
          language: 'TypeScript',
          stargazers_count: 10,
          forks_count: 2,
          open_issues_count: 1,
          created_at: '2020-01-01T00:00:00Z',
          updated_at: '2021-01-01T00:00:00Z',
          pushed_at: '2021-06-01T00:00:00Z',
          fork: false,
          archived: false,
          size: 1000,
        },
        {
          id: 2,
          name: 'fork-repo',
          full_name: 'testuser/fork-repo',
          description: 'Fork repo',
          html_url: 'https://github.com/testuser/fork-repo',
          language: 'TypeScript',
          stargazers_count: 0,
          forks_count: 0,
          open_issues_count: 0,
          created_at: '2020-01-01T00:00:00Z',
          updated_at: '2021-01-01T00:00:00Z',
          pushed_at: '2021-06-01T00:00:00Z',
          fork: true,
          archived: false,
          size: 1000,
        },
        {
          id: 3,
          name: 'archived-repo',
          full_name: 'testuser/archived-repo',
          description: 'Archived repo',
          html_url: 'https://github.com/testuser/archived-repo',
          language: 'TypeScript',
          stargazers_count: 5,
          forks_count: 1,
          open_issues_count: 0,
          created_at: '2020-01-01T00:00:00Z',
          updated_at: '2021-01-01T00:00:00Z',
          pushed_at: '2021-06-01T00:00:00Z',
          fork: false,
          archived: true,
          size: 1000,
        },
        {
          id: 4,
          name: 'empty-repo',
          full_name: 'testuser/empty-repo',
          description: 'Empty repo',
          html_url: 'https://github.com/testuser/empty-repo',
          language: null,
          stargazers_count: 0,
          forks_count: 0,
          open_issues_count: 0,
          created_at: '2020-01-01T00:00:00Z',
          updated_at: '2021-01-01T00:00:00Z',
          pushed_at: '2021-06-01T00:00:00Z',
          fork: false,
          archived: false,
          size: 0,
        },
      ];

      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, repos, {
          'x-ratelimit-remaining': '4999',
        })
      );

      const result = await getUserRepositories('testuser');

      expect(result.repositories).toHaveLength(1);
      expect(result.repositories[0].name).toBe('normal-repo');
      expect(result.filteredCount).toBe(3);
    });

    it('should limit repositories to MAX_REPOS', async () => {
      const repos = Array.from({ length: MAX_REPOS + 10 }, (_, i) => ({
        id: i,
        name: `repo-${i}`,
        full_name: `testuser/repo-${i}`,
        description: `Description ${i}`,
        html_url: `https://github.com/testuser/repo-${i}`,
        language: 'TypeScript',
        stargazers_count: i,
        forks_count: i,
        open_issues_count: i,
        created_at: '2020-01-01T00:00:00Z',
        updated_at: '2021-01-01T00:00:00Z',
        pushed_at: '2021-06-01T00:00:00Z',
        fork: false,
        archived: false,
        size: 1000,
      }));

      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, repos, {
          'x-ratelimit-remaining': '4999',
        })
      );

      const result = await getUserRepositories('testuser');

      expect(result.repositories).toHaveLength(MAX_REPOS);
    });

    it('should throw GitHubAPIError for 404', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(404, { message: 'Not Found' }, {
          'x-ratelimit-remaining': '4999',
        })
      );

      await expect(getUserRepositories('nonexistent')).rejects.toThrow(GitHubAPIError);
    });

    it('should retry on rate limit (403) and succeed', async () => {
      const repos = [
        {
          id: 1,
          name: 'repo-1',
          full_name: 'testuser/repo-1',
          description: 'Repo 1',
          html_url: 'https://github.com/testuser/repo-1',
          language: 'TypeScript',
          stargazers_count: 10,
          forks_count: 2,
          open_issues_count: 1,
          created_at: '2020-01-01T00:00:00Z',
          updated_at: '2021-01-01T00:00:00Z',
          pushed_at: '2021-06-01T00:00:00Z',
          fork: false,
          archived: false,
          size: 1000,
        },
      ];

      mockFetch
        .mockResolvedValueOnce(
          createMockResponse(403, { message: 'API rate limit exceeded' }, {
            'x-ratelimit-remaining': '0',
          })
        )
        .mockResolvedValueOnce(
          createMockResponse(200, repos, {
            'x-ratelimit-remaining': '4999',
          })
        );

      const result = await getUserRepositories('testuser');
      expect(result.repositories).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getRepositoryReadme', () => {
    it('should fetch and decode README content', async () => {
      const readmeContent = '# Test Repository\n\nThis is a test README.';
      const encodedContent = Buffer.from(readmeContent).toString('base64');

      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          200,
          { content: encodedContent, encoding: 'base64' },
          { 'x-ratelimit-remaining': '4999' }
        )
      );

      const result = await getRepositoryReadme('testuser', 'testrepo');

      expect(result).toBe(readmeContent);
    });

    it('should throw GitHubAPIError for 404', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(404, { message: 'Not Found' }, {
          'x-ratelimit-remaining': '4999',
        })
      );

      await expect(getRepositoryReadme('testuser', 'nonexistent')).rejects.toThrow(GitHubAPIError);
    });

    it('should retry on 500 and succeed', async () => {
      const readmeContent = '# README';
      const encodedContent = Buffer.from(readmeContent).toString('base64');

      mockFetch
        .mockResolvedValueOnce(
          createMockResponse(500, { message: 'Internal Server Error' }, {
            'x-ratelimit-remaining': '4999',
          })
        )
        .mockResolvedValueOnce(
          createMockResponse(
            200,
            { content: encodedContent, encoding: 'base64' },
            { 'x-ratelimit-remaining': '4999' }
          )
        );

      const result = await getRepositoryReadme('testuser', 'testrepo');
      expect(result).toBe(readmeContent);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getRepositoryCommits', () => {
    it('should fetch commits with pagination', async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => ({
        sha: `sha-${i}`,
        commit: {
          message: `Commit message ${i}`,
          author: { date: '2021-01-01T00:00:00Z' },
        },
        author: { login: 'testuser' },
      }));

      const page2 = Array.from({ length: 50 }, (_, i) => ({
        sha: `sha-${100 + i}`,
        commit: {
          message: `Commit message ${100 + i}`,
          author: { date: '2021-01-02T00:00:00Z' },
        },
        author: { login: 'testuser' },
      }));

      mockFetch
        .mockResolvedValueOnce(
          createMockResponse(200, page1, {
            'x-ratelimit-remaining': '4999',
          })
        )
        .mockResolvedValueOnce(
          createMockResponse(200, page2, {
            'x-ratelimit-remaining': '4999',
          })
        );

      const result = await getRepositoryCommits('testuser', 'testrepo');

      expect(result).toHaveLength(150);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][0]).toContain('per_page=100');
      expect(mockFetch.mock.calls[0][0]).toContain('page=1');
      expect(mockFetch.mock.calls[1][0]).toContain('per_page=100');
      expect(mockFetch.mock.calls[1][0]).toContain('page=2');
    });

    it('should limit commits to MAX_COMMITS_PER_REPO', async () => {
      const commits = Array.from({ length: MAX_COMMITS_PER_REPO + 50 }, (_, i) => ({
        sha: `sha-${i}`,
        commit: {
          message: `Commit message ${i}`,
          author: { date: '2021-01-01T00:00:00Z' },
        },
        author: { login: 'testuser' },
      }));

      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, commits, {
          'x-ratelimit-remaining': '4999',
        })
      );

      const result = await getRepositoryCommits('testuser', 'testrepo');

      expect(result).toHaveLength(MAX_COMMITS_PER_REPO);
    });

    it('should throw GitHubAPIError for 404', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(404, { message: 'Not Found' }, {
          'x-ratelimit-remaining': '4999',
        })
      );

      await expect(getRepositoryCommits('testuser', 'nonexistent')).rejects.toThrow(GitHubAPIError);
    });

    it('should retry on rate limit (403) and succeed', async () => {
      const commits = [
        {
          sha: 'sha-1',
          commit: {
            message: 'Commit 1',
            author: { date: '2021-01-01T00:00:00Z' },
          },
          author: { login: 'testuser' },
        },
      ];

      mockFetch
        .mockResolvedValueOnce(
          createMockResponse(403, { message: 'API rate limit exceeded' }, {
            'x-ratelimit-remaining': '0',
          })
        )
        .mockResolvedValueOnce(
          createMockResponse(200, commits, {
            'x-ratelimit-remaining': '4999',
          })
        );

      const result = await getRepositoryCommits('testuser', 'testrepo');
      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('rate limit handling', () => {
    it('should check x-ratelimit-remaining header on all requests', async () => {
      const mockData = {
        login: 'testuser',
        name: 'Test User',
        bio: 'A developer',
        public_repos: 10,
        followers: 5,
        following: 3,
        html_url: 'https://github.com/testuser',
        avatar_url: 'https://avatars.githubusercontent.com/u/123',
        created_at: '2020-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValue(
        createMockResponse(200, mockData, {
          'x-ratelimit-remaining': '100',
        })
      );

      await getUserProfile('testuser');
      await getUserRepositories('testuser');
      await getRepositoryReadme('testuser', 'testrepo');
      await getRepositoryCommits('testuser', 'testrepo');

      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe('logging', () => {
    it('logs each REST retry with endpoint, status and delay', async () => {
      const warn = jest.spyOn(logger, 'warn');
      mockFetch
        .mockResolvedValueOnce(createMockResponse(500, { message: 'Server error' }))
        .mockResolvedValueOnce(createMockResponse(200, { login: 'testuser' }));

      await getUserProfile('testuser');

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        {
          event: 'github.retry',
          endpoint: '/users/testuser',
          status: 500,
          attempt: 1,
          delayMs: 100,
          rateLimitRemaining: null,
        },
        'retrying GitHub request'
      );
    });

    it('logs a GraphQL retry when the response has no data', async () => {
      const warn = jest.spyOn(logger, 'warn');
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200, {}))
        .mockResolvedValueOnce(
          createMockResponse(200, { data: { user: { pinnedItems: { nodes: [] } } } })
        );

      await getUserPinnedRepositories('testuser');

      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'github.retry', endpoint: '/graphql', status: 500, attempt: 1 }),
        'retrying GitHub request'
      );
    });

    it('warns when the remaining rate limit drops below 100', async () => {
      const warn = jest.spyOn(logger, 'warn');
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, { login: 'testuser' }, { 'x-ratelimit-remaining': '42' })
      );

      await getUserProfile('testuser');

      expect(warn).toHaveBeenCalledWith(
        { event: 'github.rate_limit_low', endpoint: '/users/testuser', remaining: 42 },
        'GitHub rate limit running low'
      );
    });

    it('does not warn when the rate limit is healthy', async () => {
      const warn = jest.spyOn(logger, 'warn');
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, { login: 'testuser' }, { 'x-ratelimit-remaining': '4999' })
      );

      await getUserProfile('testuser');

      expect(warn).not.toHaveBeenCalled();
    });
  });
});
