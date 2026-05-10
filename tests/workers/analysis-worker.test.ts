jest.mock('bullmq');
jest.mock('ioredis');

import { Job } from 'bullmq';

describe('workers/analysis-worker', () => {
  const mockPublish = jest.fn().mockResolvedValue(1);
  const mockSet = jest.fn().mockResolvedValue('OK');
  const mockGet = jest.fn().mockResolvedValue(null);
  const mockQuit = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  afterAll(() => {
    delete process.env.REDIS_URL;
  });

  function setupMocks() {
    const { Queue, Worker } = require('bullmq');
    const Redis = require('ioredis');

    Redis.mockImplementation(() => {
      return {
        publish: mockPublish,
        set: mockSet,
        get: mockGet,
        quit: mockQuit,
        on: jest.fn(),
        disconnect: jest.fn(),
      };
    });

    Queue.mockImplementation(
      (name: string, opts?: any) =>
        ({
          name,
          opts,
          add: jest.fn(),
          close: jest.fn(),
        } as any)
    );

    Worker.mockImplementation(
      (name: string, processor: any, opts?: any) =>
        ({
          name,
          processor,
          opts,
          on: jest.fn(),
          close: jest.fn(),
          run: jest.fn(),
        } as any)
    );

    return { Queue, Worker, Redis };
  }

  it('should create analysisQueue with correct configuration', () => {
    const { Queue } = setupMocks();
    require('../../workers/analysis-worker');

    expect(Queue).toHaveBeenCalledWith(
      'analysis',
      expect.objectContaining({
        connection: expect.any(Object),
        defaultJobOptions: expect.objectContaining({
          attempts: 2,
          backoff: expect.objectContaining({
            type: 'exponential',
            delay: 5000,
          }),
        }),
      })
    );
  });

  it('should create analysisWorker with concurrency 3', () => {
    const { Worker } = setupMocks();
    require('../../workers/analysis-worker');

    expect(Worker).toHaveBeenCalledWith(
      'analysis',
      expect.any(Function),
      expect.objectContaining({
        connection: expect.any(Object),
        concurrency: 3,
        stalledInterval: 30000,
        maxStalledCount: 1,
      })
    );
  });

  it('should return correct SSE event channel for jobId', () => {
    setupMocks();
    const { getEventChannel } = require('../../workers/analysis-worker');
    expect(getEventChannel('job-123')).toBe('analysis:job-123:events');
  });

  it('should publish event to Redis pub/sub', async () => {
    setupMocks();
    const { publishEvent } = require('../../workers/analysis-worker');
    await publishEvent('job-123', { type: 'stateChange', state: 'PROCESSING' });
    expect(mockPublish).toHaveBeenCalledWith(
      'analysis:job-123:events',
      JSON.stringify({ type: 'stateChange', state: 'PROCESSING' })
    );
  });

  it('should update job state and publish SSE event', async () => {
    setupMocks();
    const { updateJobState } = require('../../workers/analysis-worker');
    await updateJobState('job-123', 'PROCESSING');
    expect(mockSet).toHaveBeenCalledWith('analysis:job-123:state', 'PROCESSING');
    expect(mockPublish).toHaveBeenCalledWith(
      'analysis:job-123:events',
      JSON.stringify({
        type: 'stateChange',
        state: 'PROCESSING',
        jobId: 'job-123',
      })
    );
  });

  it('should get job state from Redis', async () => {
    mockGet.mockResolvedValueOnce('COMPLETED');
    setupMocks();
    const { getJobState } = require('../../workers/analysis-worker');
    const state = await getJobState('job-123');
    expect(state).toBe('COMPLETED');
    expect(mockGet).toHaveBeenCalledWith('analysis:job-123:state');
  });
});
