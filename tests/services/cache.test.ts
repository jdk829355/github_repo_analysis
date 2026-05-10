// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type Redis from 'ioredis';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { getRedisUrl } from '../../lib/config';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { hashUrl } from '../../lib/utils';

const _CACHE_KEYS = {
  githubRepos: (username: string) => `gh:${username}:repos`,
  githubReadme: (username: string, repo: string) => `gh:${username}:${repo}:readme`,
  llmRepo: (username: string, repo: string) => `llm:repo:${username}:${repo}`,
  llmProfile: (username: string) => `llm:profile:${username}`,
} as const;

const TTL = {
  github: 3600,
  llm: 86400,
  final: 604800,
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

jest.mock('../../lib/config', () => ({
  getRedisUrl: jest.fn(() => 'redis://localhost:6379'),
}));

jest.mock('../../lib/utils', () => ({
  hashUrl: jest.fn((url: string) => `hash_${url}`),
}));

describe('services/cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCachedAnalysis', () => {
    it('should return cached analysis data when exists', async () => {
      const { getCachedAnalysis } = await import('../../services/cache');
      const cachedData = { username: 'testuser', repos: [] };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedData));

      const result = await getCachedAnalysis('testuser');

      expect(mockRedis.get).toHaveBeenCalledWith('gh:testuser:repos');
      expect(result).toEqual(cachedData);
    });

    it('should return null when cache miss', async () => {
      const { getCachedAnalysis } = await import('../../services/cache');
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await getCachedAnalysis('testuser');

      expect(result).toBeNull();
    });
  });

  describe('setCachedAnalysis', () => {
    it('should cache analysis data with correct TTL', async () => {
      const { setCachedAnalysis } = await import('../../services/cache');
      const data = { username: 'testuser', repos: [] };
      mockRedis.set.mockResolvedValueOnce('OK');

      await setCachedAnalysis('testuser', data);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'gh:testuser:repos',
        JSON.stringify(data),
        'EX',
        TTL.github
      );
    });
  });

  describe('getCachedLLMOutput', () => {
    it('should return cached LLM output for profile when exists', async () => {
      const { getCachedLLMOutput } = await import('../../services/cache');
      const cachedData = { summary: 'Test summary', skills: [] };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedData));

      const result = await getCachedLLMOutput('testuser', undefined);

      expect(mockRedis.get).toHaveBeenCalledWith('llm:profile:testuser');
      expect(result).toEqual(cachedData);
    });

    it('should return cached LLM output for repo when exists', async () => {
      const { getCachedLLMOutput } = await import('../../services/cache');
      const cachedData = { analysis: 'Test analysis' };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedData));

      const result = await getCachedLLMOutput('testuser', 'test-repo');

      expect(mockRedis.get).toHaveBeenCalledWith('llm:repo:testuser:test-repo');
      expect(result).toEqual(cachedData);
    });

    it('should return null when cache miss', async () => {
      const { getCachedLLMOutput } = await import('../../services/cache');
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await getCachedLLMOutput('testuser', 'test-repo');

      expect(result).toBeNull();
    });
  });

  describe('setCachedLLMOutput', () => {
    it('should cache LLM output with correct TTL for profile', async () => {
      const { setCachedLLMOutput } = await import('../../services/cache');
      const data = { summary: 'Test summary' };
      mockRedis.set.mockResolvedValueOnce('OK');

      await setCachedLLMOutput('testuser', undefined, data);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'llm:profile:testuser',
        JSON.stringify(data),
        'EX',
        TTL.llm
      );
    });

    it('should cache LLM output with correct TTL for repo', async () => {
      const { setCachedLLMOutput } = await import('../../services/cache');
      const data = { analysis: 'Test analysis' };
      mockRedis.set.mockResolvedValueOnce('OK');

      await setCachedLLMOutput('testuser', 'test-repo', data);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'llm:repo:testuser:test-repo',
        JSON.stringify(data),
        'EX',
        TTL.llm
      );
    });
  });

  describe('checkJobDeduplication', () => {
    it('should return jobId when active job exists', async () => {
      const { checkJobDeduplication } = await import('../../services/cache');
      mockRedis.get.mockResolvedValueOnce('job-123');

      const result = await checkJobDeduplication('https://github.com/testuser');

      expect(mockRedis.get).toHaveBeenCalledWith('job:hash_https://github.com/testuser');
      expect(result).toBe('job-123');
    });

    it('should return null when no active job exists', async () => {
      const { checkJobDeduplication } = await import('../../services/cache');
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await checkJobDeduplication('https://github.com/testuser');

      expect(result).toBeNull();
    });
  });

  describe('setJobActive', () => {
    it('should set job as active with default TTL', async () => {
      const { setJobActive } = await import('../../services/cache');
      mockRedis.set.mockResolvedValueOnce('OK');

      await setJobActive('https://github.com/testuser');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'job:hash_https://github.com/testuser',
        '1',
        'EX',
        3600
      );
    });

    it('should set job as active with custom TTL', async () => {
      const { setJobActive } = await import('../../services/cache');
      mockRedis.set.mockResolvedValueOnce('OK');

      await setJobActive('https://github.com/testuser', 7200);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'job:hash_https://github.com/testuser',
        '1',
        'EX',
        7200
      );
    });

    it('should store jobId as value', async () => {
      const { setJobActive } = await import('../../services/cache');
      mockRedis.set.mockResolvedValueOnce('OK');

      await setJobActive('https://github.com/testuser', 'job-123');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'job:hash_https://github.com/testuser',
        'job-123',
        'EX',
        3600
      );
    });

    it('should store jobId with custom TTL', async () => {
      const { setJobActive } = await import('../../services/cache');
      mockRedis.set.mockResolvedValueOnce('OK');

      await setJobActive('https://github.com/testuser', 'job-123', 7200);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'job:hash_https://github.com/testuser',
        'job-123',
        'EX',
        7200
      );
    });
  });

  describe('clearJobActive', () => {
    it('should clear active job marker', async () => {
      const { clearJobActive } = await import('../../services/cache');
      mockRedis.del.mockResolvedValueOnce(1);

      await clearJobActive('https://github.com/testuser');

      expect(mockRedis.del).toHaveBeenCalledWith('job:hash_https://github.com/testuser');
    });
  });

  describe('TTL expiry behavior', () => {
    it('should use 1 hour TTL for GitHub API responses', async () => {
      const { setCachedAnalysis } = await import('../../services/cache');
      const data = { username: 'testuser', repos: [] };
      mockRedis.set.mockResolvedValueOnce('OK');

      await setCachedAnalysis('testuser', data);

      const setCall = mockRedis.set.mock.calls[0];
      expect(setCall[2]).toBe('EX');
      expect(setCall[3]).toBe(3600);
    });

    it('should use 24 hour TTL for LLM outputs', async () => {
      const { setCachedLLMOutput } = await import('../../services/cache');
      const data = { summary: 'Test' };
      mockRedis.set.mockResolvedValueOnce('OK');

      await setCachedLLMOutput('testuser', undefined, data);

      const setCall = mockRedis.set.mock.calls[0];
      expect(setCall[3]).toBe(86400);
    });

    it('should use 7 day TTL for final results', async () => {
      const { setCachedAnalysisFinal } = await import('../../services/cache');
      const data = { username: 'testuser', final: true };
      mockRedis.set.mockResolvedValueOnce('OK');

      await setCachedAnalysisFinal('testuser', data);

      const setCall = mockRedis.set.mock.calls[0];
      expect(setCall[3]).toBe(604800);
    });
  });

  describe('cache key naming convention', () => {
    it('should use correct format for GitHub repos key', async () => {
      const { getCachedAnalysis } = await import('../../services/cache');
      mockRedis.get.mockResolvedValueOnce(null);

      await getCachedAnalysis('testuser');

      expect(mockRedis.get).toHaveBeenCalledWith('gh:testuser:repos');
    });

    it('should use correct format for GitHub README key', async () => {
      const { setCachedReadme } = await import('../../services/cache');
      mockRedis.set.mockResolvedValueOnce('OK');

      await setCachedReadme('testuser', 'test-repo', 'readme content');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'gh:testuser:test-repo:readme',
        JSON.stringify('readme content'),
        'EX',
        TTL.github
      );
    });

    it('should use correct format for LLM repo key', async () => {
      const { getCachedLLMOutput } = await import('../../services/cache');
      mockRedis.get.mockResolvedValueOnce(null);

      await getCachedLLMOutput('testuser', 'test-repo');

      expect(mockRedis.get).toHaveBeenCalledWith('llm:repo:testuser:test-repo');
    });

    it('should use correct format for LLM profile key', async () => {
      const { getCachedLLMOutput } = await import('../../services/cache');
      mockRedis.get.mockResolvedValueOnce(null);

      await getCachedLLMOutput('testuser', undefined);

      expect(mockRedis.get).toHaveBeenCalledWith('llm:profile:testuser');
    });
  });
});