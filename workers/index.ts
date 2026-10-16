import { MAX_CONCURRENT_ANALYSIS } from '../lib/constants';
import { logger } from '../lib/logger';
import { analysisWorker } from './analysis-worker';

logger.info(
  { event: 'worker.started', concurrency: MAX_CONCURRENT_ANALYSIS },
  'analysis worker started'
);

// 리스너를 달면 Node의 기본 종료 동작이 꺼지므로, 기록한 뒤 직접 종료해 컨테이너 재시작에 맡긴다.
process.on('unhandledRejection', (reason) => {
  logger.fatal({ event: 'process.unhandled_rejection', err: reason }, 'unhandled promise rejection');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.fatal({ event: 'process.uncaught_exception', err }, 'uncaught exception');
  process.exit(1);
});

process.on('SIGTERM', async () => {
  logger.info({ event: 'worker.stopping', signal: 'SIGTERM' }, 'analysis worker stopping');
  await analysisWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info({ event: 'worker.stopping', signal: 'SIGINT' }, 'analysis worker stopping');
  await analysisWorker.close();
  process.exit(0);
});
