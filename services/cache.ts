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

// 키가 없을 때만 jobId를 저장한다. 성공한 요청만 true를 받는다.
export async function acquireJobActive(githubUrl: string, jobId: string): Promise<boolean> {
  const client = getRedisClient();
  const hash = hashUrl(githubUrl);
  const result = await client.set(CACHE_KEYS.activeJob(hash), jobId, 'EX', TTL.job, 'NX');
  return result === 'OK';
}

// 값이 내 jobId일 때만 지운다. 다른 작업이 덮어쓴 키는 건드리지 않는다.
const RELEASE_JOB_ACTIVE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

export async function releaseJobActive(githubUrl: string, jobId: string): Promise<void> {
  const client = getRedisClient();
  const hash = hashUrl(githubUrl);
  await client.eval(RELEASE_JOB_ACTIVE_SCRIPT, 1, CACHE_KEYS.activeJob(hash), jobId);
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
