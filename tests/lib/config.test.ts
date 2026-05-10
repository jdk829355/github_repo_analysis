describe('lib/config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getGitHubToken', () => {
    it('should return GITHUB_TOKEN from env', () => {
      process.env.GITHUB_TOKEN = 'test-token';
      const { getGitHubToken } = require('../../lib/config');
      expect(getGitHubToken()).toBe('test-token');
    });

    it('should throw error if GITHUB_TOKEN is not set', () => {
      delete process.env.GITHUB_TOKEN;
      const { getGitHubToken } = require('../../lib/config');
      expect(() => getGitHubToken()).toThrow('GITHUB_TOKEN environment variable is not set');
    });
  });

  describe('getGeminiApiKey', () => {
    it('should return GEMINI_API_KEY from env', () => {
      process.env.GEMINI_API_KEY = 'gemini-test-key';
      const { getGeminiApiKey } = require('../../lib/config');
      expect(getGeminiApiKey()).toBe('gemini-test-key');
    });

    it('should throw error if GEMINI_API_KEY is not set', () => {
      delete process.env.GEMINI_API_KEY;
      const { getGeminiApiKey } = require('../../lib/config');
      expect(() => getGeminiApiKey()).toThrow('GEMINI_API_KEY environment variable is not set');
    });
  });

  describe('getDatabaseUrl', () => {
    it('should return DATABASE_URL from env', () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      const { getDatabaseUrl } = require('../../lib/config');
      expect(getDatabaseUrl()).toBe('postgresql://localhost:5432/test');
    });

    it('should throw error if DATABASE_URL is not set', () => {
      delete process.env.DATABASE_URL;
      const { getDatabaseUrl } = require('../../lib/config');
      expect(() => getDatabaseUrl()).toThrow('DATABASE_URL environment variable is not set');
    });
  });

  describe('getRedisUrl', () => {
    it('should return REDIS_URL from env', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      const { getRedisUrl } = require('../../lib/config');
      expect(getRedisUrl()).toBe('redis://localhost:6379');
    });

    it('should throw error if REDIS_URL is not set', () => {
      delete process.env.REDIS_URL;
      const { getRedisUrl } = require('../../lib/config');
      expect(() => getRedisUrl()).toThrow('REDIS_URL environment variable is not set');
    });
  });

  describe('getAppUrl', () => {
    it('should return NEXT_PUBLIC_APP_URL from env', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
      const { getAppUrl } = require('../../lib/config');
      expect(getAppUrl()).toBe('http://localhost:3000');
    });

    it('should throw error if NEXT_PUBLIC_APP_URL is not set', () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      const { getAppUrl } = require('../../lib/config');
      expect(() => getAppUrl()).toThrow('NEXT_PUBLIC_APP_URL environment variable is not set');
    });
  });

  describe('getGithubApiVersion', () => {
    it('should return the correct GitHub API version', () => {
      const { getGithubApiVersion } = require('../../lib/config');
      expect(getGithubApiVersion()).toBe('2022-11-28');
    });
  });
});
