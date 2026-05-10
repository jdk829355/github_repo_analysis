import { createHash } from 'crypto';
import { ValidationError } from './errors';

export function truncateToMaxSize(text: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return '';
  }

  if (Buffer.byteLength(text, 'utf-8') <= maxBytes) {
    return text;
  }

  let result = '';
  let currentBytes = 0;

  for (const char of text) {
    const charBytes = Buffer.byteLength(char, 'utf-8');
    if (currentBytes + charBytes > maxBytes) {
      break;
    }
    result += char;
    currentBytes += charBytes;
  }

  return result;
}

export function normalizeGitHubUrl(url: string): string {
  if (!url || url.trim() === '') {
    throw new ValidationError('GitHub URL cannot be empty');
  }

  let normalized = url.trim();

  if (!normalized.startsWith('http://') && !normalized.startsWith('https://') && !normalized.startsWith('github.com/')) {
    if (normalized.includes('/')) {
      normalized = 'https://' + normalized;
    } else {
      normalized = 'https://github.com/' + normalized;
    }
  } else if (normalized.startsWith('github.com/')) {
    normalized = 'https://' + normalized;
  }

  normalized = normalized.replace(/\/+$/, '');

  const githubUrlPattern = /^https:\/\/github\.com\/[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
  if (!githubUrlPattern.test(normalized)) {
    throw new ValidationError(`Invalid GitHub URL format: ${url}`);
  }

  return normalized;
}

export function hashUrl(url: string): string {
  const normalized = normalizeGitHubUrl(url);
  return createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}
