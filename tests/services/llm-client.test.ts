import { LLM_REQUEST_TIMEOUT_MS } from '../../lib/constants';
import { logger } from '../../lib/logger';
import type {
  RepositoryAnalysisInput,
  ProfileAggregationInput,
} from '../../prompts/types';

const mockCreate = jest.fn();
const mockOpenAI = jest.fn(() => ({
  chat: { completions: { create: mockCreate } },
}));

jest.mock('openai', () => ({
  ...jest.requireActual('openai'),
  __esModule: true,
  default: mockOpenAI,
}));

function createResponse(content: string | null) {
  return { choices: [{ message: { content } }] };
}

const validRepositoryOutput = {
  repositoryName: 'test-repo',
  summary: 'Test summary',
  projectType: 'web-app',
  estimatedRoles: ['Backend'],
  mainContributions: ['Implemented API'],
  techStack: ['Node.js'],
  leadershipSignals: [],
  confidence: 0.8,
};

const validProfileOutput = {
  overallSummary: 'Strong backend engineer',
  roleEstimation: {
    primary: 'Backend',
    secondary: ['Technical Lead'],
    recommended: ['Senior Backend Engineer'],
  },
  engineeringStrengths: ['API design'],
  collaborationPatterns: ['Code reviews'],
  greenFlags: ['API design evidence'],
  redFlags: ['Limited testing evidence'],
};

const repositoryInput: RepositoryAnalysisInput = {
  repositoryName: 'test-repo',
  readme: '# Test',
};

const profileInput: ProfileAggregationInput = {
  username: 'testuser',
  repositoryAnalyses: [
    {
      repositoryName: 'repo',
      summary: 'Summary',
      projectType: 'api',
      estimatedRoles: ['Backend'],
      mainContributions: ['API'],
      techStack: ['Node.js'],
      leadershipSignals: [],
      confidence: 0.7,
    },
  ],
};

describe('services/llm-client', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockOpenAI.mockClear();
    process.env.LLM_BASE_URL = 'https://llm.example.com';
    process.env.LLM_API_KEY = 'test-llm-key';
    process.env.LLM_MODEL = 'test-model';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('analyzeRepository validates structured output and returns data', async () => {
    mockCreate.mockResolvedValueOnce(createResponse(JSON.stringify(validRepositoryOutput)));

    const { analyzeRepository } = await import('../../services/llm-client');
    const result = await analyzeRepository(repositoryInput);

    expect(result).toEqual(validRepositoryOutput);
    expect(mockOpenAI).toHaveBeenCalledWith({
      baseURL: 'https://llm.example.com',
      apiKey: 'test-llm-key',
      timeout: LLM_REQUEST_TIMEOUT_MS,
      maxRetries: 2,
    });
    expect(mockCreate).toHaveBeenCalledWith({
      model: 'test-model',
      messages: [{ role: 'user', content: expect.stringContaining('test-repo') }],
      temperature: 0.1,
      max_tokens: 16384,
      response_format: { type: 'json_object' },
    });
  });

  it('analyzeRepository retries on malformed JSON and succeeds', async () => {
    jest.useFakeTimers();
    mockCreate
      .mockResolvedValueOnce(createResponse('not-json'))
      .mockResolvedValueOnce(createResponse(JSON.stringify(validRepositoryOutput)));

    const { analyzeRepository } = await import('../../services/llm-client');
    const promise = analyzeRepository(repositoryInput);
    await jest.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toEqual(validRepositoryOutput);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it.each([null, ''])('analyzeRepository retries on empty response (%p)', async (content) => {
    jest.useFakeTimers();
    mockCreate
      .mockResolvedValueOnce(createResponse(content))
      .mockResolvedValueOnce(createResponse(JSON.stringify(validRepositoryOutput)));

    const { analyzeRepository } = await import('../../services/llm-client');
    const promise = analyzeRepository(repositoryInput);
    await jest.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toEqual(validRepositoryOutput);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('analyzeRepository throws LLMAPIError after max retries on schema mismatch', async () => {
    jest.useFakeTimers();
    const invalidOutput = { repositoryName: 'bad-repo', summary: 'Missing fields' };
    mockCreate.mockResolvedValue(createResponse(JSON.stringify(invalidOutput)));

    const { analyzeRepository } = await import('../../services/llm-client');
    const promise = analyzeRepository(repositoryInput);
    const rejection = expect(promise).rejects.toMatchObject({
      name: 'LLMAPIError',
      message: 'Schema validation failed',
    });
    await jest.advanceTimersByTimeAsync(1000 + 2000);

    await rejection;
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('waits 1s then 2s between retries', async () => {
    jest.useFakeTimers();
    mockCreate.mockResolvedValue(createResponse('not-json'));

    const { analyzeRepository } = await import('../../services/llm-client');
    const promise = analyzeRepository(repositoryInput);
    const rejection = expect(promise).rejects.toMatchObject({ name: 'LLMAPIError' });

    await jest.advanceTimersByTimeAsync(0);
    expect(mockCreate).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(999);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(mockCreate).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(1999);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(mockCreate).toHaveBeenCalledTimes(3);

    await rejection;
  });

  it('aggregateProfile validates structured output and returns data', async () => {
    const validOutput = {
      overallSummary: 'Strong backend engineer',
      roleEstimation: {
        primary: 'Backend',
        secondary: ['Technical Lead'],
        recommended: ['Senior Backend Engineer'],
      },
      engineeringStrengths: ['API design'],
      collaborationPatterns: ['Code reviews'],
      greenFlags: ['API design evidence'],
      redFlags: ['Limited testing evidence'],
    };
    mockCreate.mockResolvedValueOnce(createResponse(JSON.stringify(validOutput)));

    const { aggregateProfile } = await import('../../services/llm-client');
    const result = await aggregateProfile(profileInput);

    expect(result).toEqual(validOutput);
  });

  describe('SDK errors are not retried by the app', () => {
    it('wraps an HTTP error and keeps its status code', async () => {
      const { AuthenticationError } = jest.requireActual('openai');
      mockCreate.mockRejectedValue(
        new AuthenticationError(401, { message: 'bad key' }, 'bad key', new Headers())
      );

      const { aggregateProfile } = await import('../../services/llm-client');

      await expect(aggregateProfile(profileInput)).rejects.toMatchObject({
        name: 'LLMAPIError',
        statusCode: 401,
      });
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('maps a timeout to 408', async () => {
      const { APIConnectionTimeoutError } = jest.requireActual('openai');
      mockCreate.mockRejectedValue(new APIConnectionTimeoutError());

      const { aggregateProfile } = await import('../../services/llm-client');
      const promise = aggregateProfile(profileInput);

      await expect(promise).rejects.toMatchObject({ name: 'LLMAPIError', statusCode: 408 });
      await expect(promise).rejects.toThrow('LLM request timed out');
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('maps a connection error to 503', async () => {
      const { APIConnectionError } = jest.requireActual('openai');
      mockCreate.mockRejectedValue(new APIConnectionError({}));

      const { aggregateProfile } = await import('../../services/llm-client');

      await expect(aggregateProfile(profileInput)).rejects.toMatchObject({
        name: 'LLMAPIError',
        statusCode: 503,
      });
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('logging', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('logs each call with kind, model, finish reason and token usage', async () => {
      const info = jest.spyOn(logger, 'info');
      mockCreate.mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify(validRepositoryOutput) }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500 },
      });

      const { analyzeRepository } = await import('../../services/llm-client');
      await analyzeRepository(repositoryInput);

      expect(info).toHaveBeenCalledWith(
        {
          event: 'llm.call',
          kind: 'repository',
          model: 'test-model',
          durationMs: expect.any(Number),
          finishReason: 'stop',
          promptTokens: 1200,
          completionTokens: 300,
          totalTokens: 1500,
        },
        'LLM call completed'
      );
    });

    it('labels profile aggregation calls', async () => {
      const info = jest.spyOn(logger, 'info');
      mockCreate.mockResolvedValueOnce(createResponse(JSON.stringify(validProfileOutput)));

      const { aggregateProfile } = await import('../../services/llm-client');
      await aggregateProfile(profileInput);

      expect(info).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'llm.call', kind: 'profile' }),
        'LLM call completed'
      );
    });

    it('logs an invalid response with its length but not its content', async () => {
      jest.useFakeTimers();
      const warn = jest.spyOn(logger, 'warn');
      const truncated = '{"repositoryName": "test-re';
      mockCreate
        .mockResolvedValueOnce({
          choices: [{ message: { content: truncated }, finish_reason: 'length' }],
        })
        .mockResolvedValueOnce(createResponse(JSON.stringify(validRepositoryOutput)));

      const { analyzeRepository } = await import('../../services/llm-client');
      const promise = analyzeRepository(repositoryInput);
      await jest.advanceTimersByTimeAsync(1000);
      await promise;

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        {
          event: 'llm.invalid_response',
          kind: 'repository',
          attempt: 1,
          reason: 'Malformed JSON from LLM',
          rawResponseLength: truncated.length,
          finishReason: 'length',
        },
        'LLM response did not match the expected JSON'
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain(truncated);
    });
  });
});
