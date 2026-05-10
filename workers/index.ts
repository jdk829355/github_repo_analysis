import { analysisWorker } from './analysis-worker';

process.on('SIGTERM', async () => {
  await analysisWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await analysisWorker.close();
  process.exit(0);
});
