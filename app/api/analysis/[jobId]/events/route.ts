import { NextRequest } from 'next/server';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { getRedisUrl } from '../../../../../lib/config';
import { getJobRepoList } from '../../../../../services/cache';
import { getJobState, getEventChannel } from '../../../../../workers/analysis-worker';

const prisma = new PrismaClient();

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

  const stream = new ReadableStream({
    async start(controller) {
      const channel = getEventChannel(jobId);

      const cleanup = () => {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        subscriber.off('message', handleMessage);
        request.signal.removeEventListener('abort', handleAbort);
        subscriber.unsubscribe(channel).catch(() => {});
        subscriber.quit().catch(() => {});
      };

      const handleMessage = (receivedChannel: string, message: string) => {
        if (receivedChannel !== channel) return;

        controller.enqueue(encoder.encode(`data: ${message}\n\n`));

        try {
          const parsed = JSON.parse(message);
          if (TERMINAL_EVENTS.includes(parsed.type)) {
            cleanup();
            controller.close();
          }
        } catch {
        }
      };

      const handleAbort = () => {
        cleanup();
        controller.close();
      };

      try {
        const initialState = await getJobState(jobId);
        const initialEvent = JSON.stringify({
          type: 'state',
          state: initialState ?? 'PENDING',
          jobId,
        });
        controller.enqueue(encoder.encode(`data: ${initialEvent}\n\n`));
      } catch {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'state', state: 'PENDING', jobId })}\n\n`
          )
        );
      }

      try {
        const repoList = await getJobRepoList(jobId);
        if (repoList && repoList.length > 0) {
          const repoListEvent = JSON.stringify({
            type: 'repo_list',
            totalRepos: repoList.length,
            repos: repoList,
            jobId,
          });
          controller.enqueue(encoder.encode(`data: ${repoListEvent}\n\n`));
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
          controller.enqueue(encoder.encode(`data: ${repoEvent}\n\n`));
        }
      } catch {
      }

      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
        }
      }, 30000);

      subscriber.on('message', handleMessage);
      request.signal.addEventListener('abort', handleAbort);

      try {
        await subscriber.subscribe(channel);
      } catch (err) {
        cleanup();
        controller.error(err as Error);
      }
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
