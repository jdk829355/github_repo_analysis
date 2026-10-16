import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { analysisQueue, redisConnection } from '../../../lib/queue';

const CHECK_TIMEOUT_MS = 3000;

type CheckResult = 'ok' | 'fail';

// 의존성 하나가 응답하지 않아도 헬스체크 전체가 멈추지 않도록 시간 제한을 둔다.
async function runCheck(check: () => Promise<boolean>): Promise<CheckResult> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), CHECK_TIMEOUT_MS);
  });

  try {
    return (await Promise.race([check(), timeout])) ? 'ok' : 'fail';
  } catch {
    return 'fail';
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const [redis, database, worker] = await Promise.all([
    runCheck(async () => (await redisConnection.ping()) === 'PONG'),
    runCheck(async () => {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    }),
    // 워커 컨테이너가 죽으면 분석 요청이 큐에 쌓이기만 하므로 함께 확인한다.
    runCheck(async () => (await analysisQueue.getWorkersCount()) > 0),
  ]);

  const checks = { redis, database, worker };
  const healthy = Object.values(checks).every((result) => result === 'ok');

  return NextResponse.json(
    { status: healthy ? 'ok' : 'fail', checks },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
