import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { getRedisUrl } from './config';

export type AnalysisJobData = {
  username: string;
  githubUrl: string;
};

export type JobState = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export const redisConnection = new Redis(getRedisUrl(), {
  maxRetriesPerRequest: null,
});

const prisma = new PrismaClient();

export const analysisQueue = new Queue<AnalysisJobData>('analysis', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

export function getEventChannel(jobId: string): string {
  return `analysis:${jobId}:events`;
}

export async function publishEvent(
  jobId: string,
  event: Record<string, unknown>
): Promise<void> {
  const channel = getEventChannel(jobId);
  await redisConnection.publish(channel, JSON.stringify(event));
}

export async function updateJobState(
  jobId: string,
  state: JobState
): Promise<void> {
  await redisConnection.set(`analysis:${jobId}:state`, state);
  await publishEvent(jobId, { type: 'stateChange', state, jobId });
}

export async function getJobState(jobId: string): Promise<JobState | null> {
  const state = await redisConnection.get(`analysis:${jobId}:state`);
  if (state) {
    return state as JobState;
  }

  try {
    const job = await prisma.analysis_jobs.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    if (job?.status) {
      return job.status as JobState;
    }
  } catch {
  }

  return null;
}
