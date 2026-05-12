import Redis from 'ioredis';
import { getRedisUrl } from '../lib/config';
import { hashUrl } from '../lib/utils';

const CACHE_KEYS = {
  activeJob: (githubUrlHash: string) => `job:${githubUrlHash}`,
  jobRepos: (jobId: string) => `job:${jobId}:repos`,
};

const TTL = {
  job: 3600,
  jobRepos: 3600,
};

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(getRedisUrl());
  }
  return redisClient;
}

export async function checkJobDeduplication(githubUrl: string): Promise<string | null> {
  const client = getRedisClient();
  const hash = hashUrl(githubUrl);
  const value = await client.get(CACHE_KEYS.activeJob(hash));
  return value || null;
}

export async function setJobActive(githubUrl: string, valueOrTtl?: string | number, ttl?: number): Promise<void> {
  const client = getRedisClient();
  const hash = hashUrl(githubUrl);
  let value = '1';
  let finalTtl = TTL.job;

  if (typeof valueOrTtl === 'string') {
    value = valueOrTtl;
    finalTtl = ttl ?? TTL.job;
  } else if (typeof valueOrTtl === 'number') {
    finalTtl = valueOrTtl;
  }

  await client.set(CACHE_KEYS.activeJob(hash), value, 'EX', finalTtl);
}

export async function clearJobActive(githubUrl: string): Promise<void> {
  const client = getRedisClient();
  const hash = hashUrl(githubUrl);
  await client.del(CACHE_KEYS.activeJob(hash));
}

export async function setJobRepoList(jobId: string, repos: string[]): Promise<void> {
  const client = getRedisClient();
  await client.set(CACHE_KEYS.jobRepos(jobId), JSON.stringify(repos), 'EX', TTL.jobRepos);
}

export async function getJobRepoList(jobId: string): Promise<string[] | null> {
  const client = getRedisClient();
  const data = await client.get(CACHE_KEYS.jobRepos(jobId));
  return data ? JSON.parse(data) : null;
}

export { TTL };
