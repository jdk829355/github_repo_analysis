jest.mock('bullmq');
jest.mock('ioredis');

describe('workers/analysis-worker', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  afterAll(() => {
    delete process.env.REDIS_URL;
  });

  it('should create analysisWorker with concurrency 3', () => {
    const { Queue, Worker } = require('bullmq');
    const Redis = require('ioredis');

    Redis.mockImplementation(() => ({ on: jest.fn(), disconnect: jest.fn() }));
    Queue.mockImplementation(() => ({ add: jest.fn(), close: jest.fn() }));
    Worker.mockImplementation(() => ({ on: jest.fn(), close: jest.fn() }));

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
});
