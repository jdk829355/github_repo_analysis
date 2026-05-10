import { truncateToMaxSize, normalizeGitHubUrl, hashUrl } from '../../lib/utils';

describe('lib/utils', () => {
  describe('truncateToMaxSize', () => {
    it('should return original text if within max bytes', () => {
      const text = 'Hello, World!';
      const result = truncateToMaxSize(text, 100);
      expect(result).toBe(text);
    });

    it('should truncate text exceeding max bytes', () => {
      const text = 'Hello, World! This is a longer string that needs truncation.';
      const maxBytes = 20;
      const result = truncateToMaxSize(text, maxBytes);
      expect(Buffer.byteLength(result, 'utf-8')).toBeLessThanOrEqual(maxBytes);
    });

    it('should handle empty string', () => {
      const result = truncateToMaxSize('', 100);
      expect(result).toBe('');
    });

    it('should handle multibyte characters', () => {
      const text = 'Hello 👋 World 🌍';
      const maxBytes = 15;
      const result = truncateToMaxSize(text, maxBytes);
      expect(Buffer.byteLength(result, 'utf-8')).toBeLessThanOrEqual(maxBytes);
    });
  });

  describe('normalizeGitHubUrl', () => {
    it('should normalize URL with trailing slash', () => {
      const url = 'https://github.com/username/';
      const result = normalizeGitHubUrl(url);
      expect(result).toBe('https://github.com/username');
    });

    it('should normalize URL without trailing slash', () => {
      const url = 'https://github.com/username';
      const result = normalizeGitHubUrl(url);
      expect(result).toBe('https://github.com/username');
    });

    it('should handle URL without protocol', () => {
      const url = 'github.com/username';
      const result = normalizeGitHubUrl(url);
      expect(result).toBe('https://github.com/username');
    });

    it('should handle URL without protocol and trailing slash', () => {
      const url = 'github.com/username/';
      const result = normalizeGitHubUrl(url);
      expect(result).toBe('https://github.com/username');
    });

    it('should handle username-only URL', () => {
      const url = 'username';
      const result = normalizeGitHubUrl(url);
      expect(result).toBe('https://github.com/username');
    });

    it('should throw error for invalid URL format', () => {
      expect(() => normalizeGitHubUrl('')).toThrow();
      expect(() => normalizeGitHubUrl('not--valid')).toThrow();
    });
  });

  describe('hashUrl', () => {
    it('should return consistent hash for same URL', () => {
      const url = 'https://github.com/username';
      const hash1 = hashUrl(url);
      const hash2 = hashUrl(url);
      expect(hash1).toBe(hash2);
    });

    it('should return consistent hash for normalized URL', () => {
      const url1 = 'https://github.com/username/';
      const url2 = 'https://github.com/username';
      const hash1 = hashUrl(url1);
      const hash2 = hashUrl(url2);
      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different URLs', () => {
      const hash1 = hashUrl('https://github.com/user1');
      const hash2 = hashUrl('https://github.com/user2');
      expect(hash1).not.toBe(hash2);
    });

    it('should return a non-empty string', () => {
      const hash = hashUrl('https://github.com/username');
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });
  });
});
