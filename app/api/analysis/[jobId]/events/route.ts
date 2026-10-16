import { NextRequest } from 'next/server';
import Redis from 'ioredis';
import { getRedisUrl } from '../../../../../lib/config';
import { prisma } from '../../../../../lib/prisma';
import { getJobRepoList } from '../../../../../services/cache';
import { getJobState, getEventChannel } from '../../../../../lib/queue';

const TERMINAL_EVENTS = [
  'job_complete',
  'job_failed',
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const encoder = new TextEncoder();

  const subscriber = new Redis(getRedisUrl(), {
    maxRetriesPerRequest: null,
  });

  let heartbeatInterval: NodeJS.Timeout | null = null;
  let closed = false;
  let cleanup = () => {};

  const stream = new ReadableStream({
    async start(controller) {
      const channel = getEventChannel(jobId);

      cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        subscriber.off('message', handleMessage);
        request.signal.removeEventListener('abort', handleAbort);
        subscriber.unsubscribe(channel).catch(() => {});
        subscriber.quit().catch(() => {});
      };

      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup();
        }
      };

      const closeStream = () => {
        cleanup();
        try {
          controller.close();
        } catch {
        }
      };

      const handleMessage = (receivedChannel: string, message: string) => {
        if (receivedChannel !== channel) return;

        send(`data: ${message}\n\n`);

        try {
          const parsed = JSON.parse(message);
          if (TERMINAL_EVENTS.includes(parsed.type)) {
            closeStream();
          }
        } catch {
        }
      };

      const handleAbort = () => {
        closeStream();
      };

      subscriber.on('message', handleMessage);
      request.signal.addEventListener('abort', handleAbort);

      // pub/sub은 구독 전에 발행된 메시지를 보관하지 않는다. 먼저 구독한 뒤에
      // 상태를 읽어야 그 사이에 끝난 작업의 종료 이벤트를 놓치지 않는다.
      try {
        await subscriber.subscribe(channel);
      } catch (err) {
        cleanup();
        controller.error(err as Error);
        return;
      }

      heartbeatInterval = setInterval(() => {
        send(': heartbeat\n\n');
      }, 30000);

      let initialState: string | null = null;
      try {
        initialState = await getJobState(jobId);
      } catch {
      }
      send(
        `data: ${JSON.stringify({
          type: 'state',
          state: initialState ?? 'PENDING',
          jobId,
        })}\n\n`
      );

      try {
        const repoList = await getJobRepoList(jobId);
        if (repoList && repoList.length > 0) {
          const repoListEvent = JSON.stringify({
            type: 'repo_list',
            totalRepos: repoList.length,
            repos: repoList,
            jobId,
          });
          send(`data: ${repoListEvent}\n\n`);
        }
      } catch {
      }

      try {
        const completedRepos = await prisma.repositories.findMany({
          where: { analysis_job_id: jobId },
          include: { repository_analyses: true },
        });

        for (const repo of completedRepos) {
          const analysis = repo.repository_analyses[0];
          const repoEvent = JSON.stringify({
            type: 'repo_analysis_completed',
            repo: repo.name,
            summary: analysis?.summary || '',
            jobId,
          });
          send(`data: ${repoEvent}\n\n`);
        }
      } catch {
      }

      if (initialState === 'COMPLETED' || initialState === 'FAILED') {
        closeStream();
      }
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
