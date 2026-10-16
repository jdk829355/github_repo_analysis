const TTL = {
  job: 3600,
  jobRepos: 3600,
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  eval: jest.fn(),
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

  describe('checkJobDeduplication', () => {
    it('returns jobId when active job exists', async () => {
      const { checkJobDeduplication } = await import('../../services/cache');
      mockRedis.get.mockResolvedValueOnce('job-123');

      const result = await checkJobDeduplication('https://github.com/testuser');

      expect(mockRedis.get).toHaveBeenCalledWith('job:hash_https://github.com/testuser');
      expect(result).toBe('job-123');
    });

    it('returns null when no active job exists', async () => {
      const { checkJobDeduplication } = await import('../../services/cache');
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await checkJobDeduplication('https://github.com/testuser');

      expect(result).toBeNull();
    });
  });

  describe('setJobActive', () => {
    it('sets default active marker with default TTL', async () => {
      const { setJobActive } = await import('../../services/cache');

      await setJobActive('https://github.com/testuser');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'job:hash_https://github.com/testuser',
        '1',
        'EX',
        TTL.job
      );
    });

    it('stores jobId with custom TTL', async () => {
      const { setJobActive } = await import('../../services/cache');

      await setJobActive('https://github.com/testuser', 'job-123', 7200);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'job:hash_https://github.com/testuser',
        'job-123',
        'EX',
        7200
      );
    });
  });

  describe('acquireJobActive', () => {
    it('sets the key with NX and returns true when acquired', async () => {
      const { acquireJobActive } = await import('../../services/cache');
      mockRedis.set.mockResolvedValueOnce('OK');

      const result = await acquireJobActive('https://github.com/testuser', 'job-123');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'job:hash_https://github.com/testuser',
        'job-123',
        'EX',
        TTL.job,
        'NX'
      );
      expect(result).toBe(true);
    });

    it('returns false when the key already exists', async () => {
      const { acquireJobActive } = await import('../../services/cache');
      mockRedis.set.mockResolvedValueOnce(null);

      const result = await acquireJobActive('https://github.com/testuser', 'job-456');

      expect(result).toBe(false);
    });
  });

  describe('releaseJobActive', () => {
    it('runs a compare-and-delete script with the key and jobId', async () => {
      const { releaseJobActive } = await import('../../services/cache');
      mockRedis.eval.mockResolvedValueOnce(1);

      await releaseJobActive('https://github.com/testuser', 'job-123');

      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringMatching(/get.*KEYS\[1\].*==.*ARGV\[1\][\s\S]*del.*KEYS\[1\]/),
        1,
        'job:hash_https://github.com/testuser',
        'job-123'
      );
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  it('stores and reads job repo list', async () => {
    const { setJobRepoList, getJobRepoList } = await import('../../services/cache');
    const repos = ['repo-a', 'repo-b'];
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(repos));

    await setJobRepoList('job-123', repos);
    const result = await getJobRepoList('job-123');

    expect(mockRedis.set).toHaveBeenCalledWith(
      'job:job-123:repos',
      JSON.stringify(repos),
      'EX',
      TTL.jobRepos
    );
    expect(mockRedis.get).toHaveBeenCalledWith('job:job-123:repos');
    expect(result).toEqual(repos);
  });
});
