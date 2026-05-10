import Redis from 'ioredis';
import { getRedisUrl } from '../lib/config';
import { hashUrl } from '../lib/utils';

const CACHE_KEYS = {
  githubRepos: (username: string) => `gh:${username}:repos`,
  githubReadme: (username: string, repo: string) => `gh:${username}:${repo}:readme`,
  llmRepo: (username: string, repo: string) => `llm:repo:${username}:${repo}`,
  llmProfile: (username: string) => `llm:profile:${username}`,
};

const TTL = {
  github: 3600,
  llm: 86400,
  final: 604800,
};

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(getRedisUrl());
  }
  return redisClient;
}

export async function getCachedAnalysis(username: string): Promise<Record<string, unknown> | null> {
  const client = getRedisClient();
  const data = await client.get(CACHE_KEYS.githubRepos(username));
  return data ? JSON.parse(data) : null;
}

export async function setCachedAnalysis(username: string, data: Record<string, unknown>): Promise<void> {
  const client = getRedisClient();
  await client.set(CACHE_KEYS.githubRepos(username), JSON.stringify(data), 'EX', TTL.github);
}

export async function setCachedReadme(username: string, repo: string, content: string): Promise<void> {
  const client = getRedisClient();
  await client.set(CACHE_KEYS.githubReadme(username, repo), JSON.stringify(content), 'EX', TTL.github);
}

export async function getCachedReadme(username: string, repo: string): Promise<string | null> {
  const client = getRedisClient();
  const data = await client.get(CACHE_KEYS.githubReadme(username, repo));
  return data ? JSON.parse(data) : null;
}

export async function getCachedLLMOutput(username: string, repo?: string): Promise<Record<string, unknown> | null> {
  const client = getRedisClient();
  const key = repo ? CACHE_KEYS.llmRepo(username, repo) : CACHE_KEYS.llmProfile(username);
  const data = await client.get(key);
  return data ? JSON.parse(data) : null;
}

export async function setCachedLLMOutput(username: string, repo: string | undefined, data: Record<string, unknown>): Promise<void> {
  const client = getRedisClient();
  const key = repo ? CACHE_KEYS.llmRepo(username, repo) : CACHE_KEYS.llmProfile(username);
  await client.set(key, JSON.stringify(data), 'EX', TTL.llm);
}

export async function setCachedAnalysisFinal(username: string, data: Record<string, unknown>): Promise<void> {
  const client = getRedisClient();
  await client.set(CACHE_KEYS.llmProfile(username), JSON.stringify(data), 'EX', TTL.final);
}

export async function checkJobDeduplication(githubUrl: string): Promise<string | null> {
  const client = getRedisClient();
  const hash = hashUrl(githubUrl);
  const value = await client.get(`job:${hash}`);
  return value || null;
}

export async function setJobActive(githubUrl: string, valueOrTtl?: string | number, ttl?: number): Promise<void> {
  const client = getRedisClient();
  const hash = hashUrl(githubUrl);
  let value = '1';
  let finalTtl = 3600;

  if (typeof valueOrTtl === 'string') {
    value = valueOrTtl;
    finalTtl = ttl ?? 3600;
  } else if (typeof valueOrTtl === 'number') {
    finalTtl = valueOrTtl;
  }

  await client.set(`job:${hash}`, value, 'EX', finalTtl);
}

export async function clearJobActive(githubUrl: string): Promise<void> {
  const client = getRedisClient();
  const hash = hashUrl(githubUrl);
  await client.del(`job:${hash}`);
}

export async function setJobRepoList(jobId: string, repos: string[]): Promise<void> {
  const client = getRedisClient();
  await client.set(`job:${jobId}:repos`, JSON.stringify(repos), 'EX', TTL.github);
}

export async function getJobRepoList(jobId: string): Promise<string[] | null> {
  const client = getRedisClient();
  const data = await client.get(`job:${jobId}:repos`);
  return data ? JSON.parse(data) : null;
}

export { TTL };