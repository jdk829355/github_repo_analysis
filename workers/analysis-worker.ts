import { Worker } from 'bullmq';
import { MAX_CONCURRENT_ANALYSIS } from '../lib/constants';
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
