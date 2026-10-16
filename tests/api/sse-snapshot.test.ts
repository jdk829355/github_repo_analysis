const callOrder: string[] = [];

jest.mock('ioredis');
jest.mock('../../lib/config', () => ({
  getRedisUrl: jest.fn().mockReturnValue('redis://localhost:6379'),
}));
jest.mock('../../services/cache', () => ({
  getJobRepoList: jest.fn().mockResolvedValue(null),
}));
const mockJobFindUnique = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: {
    repositories: { findMany: jest.fn().mockResolvedValue([]) },
    analysis_jobs: { findUnique: (...args: unknown[]) => mockJobFindUnique(...args) },
  },
}));
jest.mock('../../lib/queue', () => ({
  getJobState: jest.fn(),
  getEventChannel: jest.fn((jobId: string) => `analysis:${jobId}:events`),
}));

import Redis from 'ioredis';
import { GET } from '../../app/api/analysis/[jobId]/events/route';
import { getJobState } from '../../lib/queue';

describe('GET /api/analysis/[jobId]/events snapshot ordering', () => {
  let messageHandlers: Array<(channel: string, message: string) => void>;
  let mockQuit: jest.Mock;

  beforeEach(() => {
    callOrder.length = 0;
    messageHandlers = [];
    mockQuit = jest.fn().mockResolvedValue(undefined);

    (Redis as unknown as jest.Mock).mockImplementation(() => ({
      subscribe: jest.fn().mockImplementation(async () => {
        callOrder.push('subscribe');
      }),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
      quit: mockQuit,
      on: (event: string, handler: (channel: string, message: string) => void) => {
        if (event === 'message') messageHandlers.push(handler);
      },
      off: (event: string, handler: (channel: string, message: string) => void) => {
        if (event === 'message') {
          messageHandlers = messageHandlers.filter((h) => h !== handler);
        }
      },
    }));

    (getJobState as jest.Mock).mockReset().mockImplementation(async () => {
      callOrder.push('getJobState');
      return 'PROCESSING';
    });
  });

  function createRequest(signal?: AbortSignal): Request {
    return new Request('http://localhost/api/analysis/job-123/events', { signal });
  }

  it('subscribes to the channel before reading the job state snapshot', async () => {
    const abortController = new AbortController();
    const response = await GET(createRequest(abortController.signal) as any, {
      params: Promise.resolve({ jobId: 'job-123' }),
    });

    const reader = response.body!.getReader();
    await reader.read();

    expect(callOrder).toEqual(['subscribe', 'getJobState']);

    reader.releaseLock();
    abortController.abort();
  });

  it('closes the stream after sending a terminal snapshot state', async () => {
    (getJobState as jest.Mock).mockResolvedValue('COMPLETED');
    const response = await GET(createRequest() as any, {
      params: Promise.resolve({ jobId: 'job-123' }),
    });

    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value!)).toContain('"state":"COMPLETED"');

    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 1000));
    let result: 'timeout' | ReadableStreamReadResult<Uint8Array> = 'timeout';
    for (let i = 0; i < 5; i++) {
      const next = await Promise.race([reader.read(), timeout]);
      result = next;
      if (next === 'timeout' || next.done) break;
    }

    expect(result).not.toBe('timeout');
    expect((result as ReadableStreamReadResult<Uint8Array>).done).toBe(true);
    expect(mockQuit).toHaveBeenCalled();
  });

  it('includes the stored error message when the snapshot state is FAILED', async () => {
    (getJobState as jest.Mock).mockResolvedValue('FAILED');
    mockJobFindUnique.mockResolvedValue({ error_message: 'GEMINI_API_KEY environment variable is not set' });

    const response = await GET(createRequest() as any, {
      params: Promise.resolve({ jobId: 'job-123' }),
    });

    const reader = response.body!.getReader();
    const first = await reader.read();
    const event = JSON.parse(new TextDecoder().decode(first.value!).replace(/^data: /, ''));
    expect(event.state).toBe('FAILED');
    expect(event.error).toBe('GEMINI_API_KEY environment variable is not set');

    reader.releaseLock();
  });

  it('ignores Redis messages that arrive after the client cancelled the stream', async () => {
    const response = await GET(createRequest() as any, {
      params: Promise.resolve({ jobId: 'job-123' }),
    });

    const reader = response.body!.getReader();
    await reader.read();
    const lateHandlers = [...messageHandlers];
    await reader.cancel();

    const event = JSON.stringify({ type: 'repo_analysis_completed', repo: 'foo' });
    expect(() => {
      lateHandlers.forEach((h) => h('analysis:job-123:events', event));
    }).not.toThrow();
    expect(mockQuit).toHaveBeenCalled();
  });
});
