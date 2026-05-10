jest.mock('ioredis');
jest.mock('../../lib/config', () => ({
  getRedisUrl: jest.fn().mockReturnValue('redis://localhost:6379'),
}));
jest.mock('../../services/cache', () => ({
  getJobRepoList: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../workers/analysis-worker', () => ({
  getJobState: jest.fn(),
  getEventChannel: jest.fn(),
  publishEvent: jest.fn(),
  updateJobState: jest.fn(),
  processAnalysisJob: jest.fn(),
  analysisQueue: {},
  analysisWorker: {},
}));

import { GET } from '../../app/api/analysis/[jobId]/events/route';
import { getJobState, getEventChannel } from '../../workers/analysis-worker';
import Redis from 'ioredis';

describe('GET /api/analysis/[jobId]/events', () => {
  let messageHandlers: Array<(channel: string, message: string) => void> = [];
  let mockSubscribe: jest.Mock;
  let mockUnsubscribe: jest.Mock;
  let mockQuit: jest.Mock;
  let mockOff: jest.Mock;
  let mockOn: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    messageHandlers = [];
    process.env.REDIS_URL = 'redis://localhost:6379';

    mockSubscribe = jest.fn().mockResolvedValue(undefined);
    mockUnsubscribe = jest.fn().mockResolvedValue(undefined);
    mockQuit = jest.fn().mockResolvedValue(undefined);
    mockOff = jest.fn().mockImplementation((event: string, handler: any) => {
      if (event === 'message') {
        const index = messageHandlers.indexOf(handler);
        if (index > -1) {
          messageHandlers.splice(index, 1);
        }
      }
    });
    mockOn = jest.fn().mockImplementation((event: string, handler: any) => {
      if (event === 'message') {
        messageHandlers.push(handler);
      }
    });

    (Redis as unknown as jest.Mock).mockImplementation(() => ({
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
      quit: mockQuit,
      on: mockOn,
      off: mockOff,
      get: jest.fn().mockResolvedValue(null),
    }));

    (getJobState as jest.Mock).mockResolvedValue('PENDING');
    (getEventChannel as jest.Mock).mockImplementation(
      (jobId: string) => `analysis:${jobId}:events`
    );
  });

  afterAll(() => {
    delete process.env.REDIS_URL;
  });

  function createRequest(signal?: AbortSignal): Request {
    return new Request('http://localhost/api/analysis/job-123/events', { signal });
  }

  async function readChunks(response: Response, maxChunks = 10): Promise<string[]> {
    const reader = response.body!.getReader();
    const chunks: string[] = [];
    while (chunks.length < maxChunks) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }
    reader.releaseLock();
    return chunks;
  }

  it('should return SSE headers', async () => {
    const abortController = new AbortController();
    const request = createRequest(abortController.signal);
    const response = await GET(request as any, {
      params: Promise.resolve({ jobId: 'job-123' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');

    abortController.abort();
  });

  it('should subscribe to Redis event channel', async () => {
    const abortController = new AbortController();
    const request = createRequest(abortController.signal);
    const response = await GET(request as any, { params: Promise.resolve({ jobId: 'job-123' }) });

    const reader = response.body!.getReader();
    await reader.read();

    expect(getEventChannel).toHaveBeenCalledWith('job-123');
    expect(mockSubscribe).toHaveBeenCalledWith('analysis:job-123:events');

    reader.releaseLock();
    abortController.abort();
  });

  it('should send initial job state as first event', async () => {
    (getJobState as jest.Mock).mockResolvedValue('PROCESSING');
    const abortController = new AbortController();
    const request = createRequest(abortController.signal);
    const response = await GET(request as any, {
      params: Promise.resolve({ jobId: 'job-123' }),
    });

    const chunks = await readChunks(response, 1);
    expect(chunks[0]).toContain('data:');
    expect(chunks[0]).toContain('"state":"PROCESSING"');
    expect(chunks[0]).toContain('"jobId":"job-123"');

    abortController.abort();
  });

  it('should forward Redis events', async () => {
    const abortController = new AbortController();
    const request = createRequest(abortController.signal);
    const response = await GET(request as any, {
      params: Promise.resolve({ jobId: 'job-123' }),
    });

    const chunksPromise = readChunks(response, 2);
    await new Promise((r) => setTimeout(r, 10));

    const event = JSON.stringify({ type: 'repo_analysis_completed', repo: 'foo' });
    messageHandlers.forEach((h) => h('analysis:job-123:events', event));

    const chunks = await chunksPromise;
    expect(chunks[1]).toBe(`data: ${event}\n\n`);

    abortController.abort();
  });

  it('should close stream on terminal events', async () => {
    const request = createRequest();
    const response = await GET(request as any, {
      params: Promise.resolve({ jobId: 'job-123' }),
    });

    const chunksPromise = readChunks(response, 10);
    await new Promise((r) => setTimeout(r, 10));

    const event = JSON.stringify({ type: 'job_complete', jobId: 'job-123' });
    messageHandlers.forEach((h) => h('analysis:job-123:events', event));

    const chunks = await chunksPromise;
    expect(chunks.some((c) => c.includes('"type":"job_complete"'))).toBe(true);
    expect(mockUnsubscribe).toHaveBeenCalledWith('analysis:job-123:events');
    expect(mockQuit).toHaveBeenCalled();
  });

  it('should send heartbeat every 30 seconds', async () => {
    jest.useFakeTimers({ legacyFakeTimers: true });
    const abortController = new AbortController();
    const request = createRequest(abortController.signal);
    const response = await GET(request as any, {
      params: Promise.resolve({ jobId: 'job-123' }),
    });

    const reader = response.body!.getReader();
    await reader.read();

    jest.advanceTimersByTime(30000);
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value!);
    expect(text).toBe(': heartbeat\n\n');

    reader.releaseLock();
    abortController.abort();
    jest.useRealTimers();
  });

  it('should cleanup on client abort', async () => {
    const abortController = new AbortController();
    const request = createRequest(abortController.signal);
    const response = await GET(request as any, {
      params: Promise.resolve({ jobId: 'job-123' }),
    });

    const reader = response.body!.getReader();
    reader.read().catch(() => {});

    await new Promise((r) => setTimeout(r, 10));
    abortController.abort();
    await new Promise((r) => setTimeout(r, 10));

    expect(mockUnsubscribe).toHaveBeenCalledWith('analysis:job-123:events');
    expect(mockQuit).toHaveBeenCalled();
  });
});
