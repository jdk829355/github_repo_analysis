import { Worker } from 'bullmq';
import { MAX_CONCURRENT_ANALYSIS } from '../lib/constants';
import { logger } from '../lib/logger';
import { redisConnection, type AnalysisJobData } from '../lib/queue';

export const analysisWorker = new Worker<AnalysisJobData>(
  'analysis',
  async (job) => {
    const { username, githubUrl } = job.data;
    const { runAnalysisPipeline } = await import('../services/analysis/orchestrator');
    await runAnalysisPipeline(username, githubUrl, job.id!);
  },
  {
    connection: redisConnection,
    concurrency: MAX_CONCURRENT_ANALYSIS,
    stalledInterval: 30000,
    maxStalledCount: 1,
  }
);

analysisWorker.on('failed', () => {});
analysisWorker.on('completed', () => {});

// 작업 단위 시작·완료·실패는 orchestrator가 남긴다. 여기서는 작업 밖에서 생기는 일만 남긴다.
analysisWorker.on('error', (err) => {
  logger.error({ event: 'worker.error', err }, 'analysis worker error');
});

// 처리 중이던 워커가 죽어 lock이 만료된 작업. maxStalledCount를 넘기면 실패로 넘어간다.
analysisWorker.on('stalled', (jobId) => {
  logger.warn({ event: 'job.stalled', jobId }, 'analysis job stalled');
});
