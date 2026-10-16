import { Writable } from 'stream';
import { createLogger, scrubSecrets } from '../../lib/logger';
import { GitHubAPIError, LLMAPIError } from '../../lib/errors';

function captureLogger() {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()));
      callback();
    },
  });
  return { logger: createLogger(destination), lines };
}

describe('lib/logger', () => {
  const originalLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    process.env.LOG_LEVEL = 'debug';
  });

  afterAll(() => {
    process.env.LOG_LEVEL = originalLevel;
  });

  it('writes one JSON line with a level label and ISO time, without pid or hostname', () => {
    const { logger, lines } = captureLogger();

    logger.info({ event: 'job.started', jobId: 'job-1' }, 'analysis job started');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 'info',
      event: 'job.started',
      jobId: 'job-1',
      msg: 'analysis job started',
    });
    expect(typeof lines[0].time).toBe('string');
    expect(lines[0]).not.toHaveProperty('pid');
    expect(lines[0]).not.toHaveProperty('hostname');
  });

  it('keeps fields of custom errors', () => {
    const { logger, lines } = captureLogger();

    logger.error({ err: new GitHubAPIError('Bad gateway', 502, '/users/foo') }, 'failed');

    expect(lines[0].err).toMatchObject({
      type: 'GitHubAPIError',
      message: 'Bad gateway',
      statusCode: 502,
      endpoint: '/users/foo',
    });
  });

  it('replaces the LLM raw response with its length', () => {
    const { logger, lines } = captureLogger();

    logger.error({ err: new LLMAPIError('Schema validation failed', 422, 'x'.repeat(1234)) }, 'failed');

    const err = lines[0].err as Record<string, unknown>;
    expect(err).not.toHaveProperty('rawResponse');
    expect(err.rawResponseLength).toBe(1234);
  });

  it('scrubs secrets from error messages and stacks', () => {
    const { logger, lines } = captureLogger();
    const token = `ghp_${'a'.repeat(36)}`;

    logger.error({ err: new Error(`token ${token} rejected`) }, 'failed');

    const err = lines[0].err as Record<string, string>;
    expect(err.message).toBe('token [REDACTED] rejected');
    expect(err.stack).not.toContain(token);
  });

  it('redacts secret-looking fields and prompts', () => {
    const { logger, lines } = captureLogger();

    logger.info({
      headers: { authorization: 'Bearer abc' },
      llm: { apiKey: 'sk-test', prompt: 'README contents' },
      db: { password: 'pw' },
    });

    expect(lines[0]).toMatchObject({
      headers: { authorization: '[REDACTED]' },
      llm: { apiKey: '[REDACTED]', prompt: '[REDACTED]' },
      db: { password: '[REDACTED]' },
    });
  });

  it('serializes non-error values passed as err', () => {
    const { logger, lines } = captureLogger();

    logger.error({ err: 'plain failure' }, 'failed');

    expect(lines[0].err).toEqual({ message: 'plain failure' });
  });
});

describe('scrubSecrets', () => {
  it.each([
    [`ghp_${'A'.repeat(36)}`, '[REDACTED]'],
    [`github_pat_${'A1_'.repeat(10)}`, '[REDACTED]'],
    [`sk-${'b'.repeat(40)}`, '[REDACTED]'],
    ['Authorization: Bearer abc.def-ghi', 'Authorization: Bearer [REDACTED]'],
    [
      'postgresql://postgres.ref:s3cr3t@aws-0.pooler.supabase.com:5432/postgres',
      'postgresql://postgres.ref:[REDACTED]@aws-0.pooler.supabase.com:5432/postgres',
    ],
  ])('masks %s', (input, expected) => {
    expect(scrubSecrets(input)).toBe(expected);
  });

  it('leaves ordinary text untouched', () => {
    const text = "Can't reach database server at `aws-0.pooler.supabase.com:5432`";
    expect(scrubSecrets(text)).toBe(text);
  });
});
