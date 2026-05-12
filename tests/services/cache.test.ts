const TTL = {
  job: 3600,
  jobRepos: 3600,
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
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

  it('clears active job marker', async () => {
    const { clearJobActive } = await import('../../services/cache');

    await clearJobActive('https://github.com/testuser');

    expect(mockRedis.del).toHaveBeenCalledWith('job:hash_https://github.com/testuser');
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
