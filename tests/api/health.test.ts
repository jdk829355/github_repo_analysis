const mockPing = jest.fn();
const mockGetWorkersCount = jest.fn();
const mockQueryRaw = jest.fn();

jest.mock('../../lib/queue', () => ({
  redisConnection: { ping: mockPing },
  analysisQueue: { getWorkersCount: mockGetWorkersCount },
}));

jest.mock('../../lib/prisma', () => ({
  prisma: { $queryRaw: mockQueryRaw },
}));

import { GET } from '../../app/api/health/route';

describe('GET /api/health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPing.mockResolvedValue('PONG');
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
    mockGetWorkersCount.mockResolvedValue(1);
  });

  it('returns 200 when redis, database and worker are healthy', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      status: 'ok',
      checks: { redis: 'ok', database: 'ok', worker: 'ok' },
    });
  });

  it('returns 503 when redis ping fails', async () => {
    mockPing.mockRejectedValue(new Error('connection refused'));

    const response = await GET();

    expect(response.status).toBe(503);
    expect((await response.json()).checks.redis).toBe('fail');
  });

  it('returns 503 when the database query fails', async () => {
    mockQueryRaw.mockRejectedValue(new Error('db down'));

    const response = await GET();

    expect(response.status).toBe(503);
    expect((await response.json()).checks.database).toBe('fail');
  });

  it('returns 503 when no worker is connected', async () => {
    mockGetWorkersCount.mockResolvedValue(0);

    const response = await GET();

    expect(response.status).toBe(503);
    expect((await response.json()).checks.worker).toBe('fail');
  });

  it('marks a check as failed when it does not respond in time', async () => {
    jest.useFakeTimers();
    mockQueryRaw.mockReturnValue(new Promise(() => {}));

    const pending = GET();
    await jest.advanceTimersByTimeAsync(3000);
    const response = await pending;

    expect(response.status).toBe(503);
    expect((await response.json()).checks).toEqual({
      redis: 'ok',
      database: 'fail',
      worker: 'ok',
    });
    jest.useRealTimers();
  });
});
