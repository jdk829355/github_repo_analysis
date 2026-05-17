import { GeminiAPIError } from '../../lib/errors';
import { ANALYSIS_TIMEOUT_MS } from '../../lib/constants';
import type {
  RepositoryAnalysisInput,
  ProfileAggregationInput,
} from '../../prompts/types';

const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({
  generateContent: mockGenerateContent,
}));
const mockGoogleGenerativeAI = jest.fn(() => ({
  getGenerativeModel: mockGetGenerativeModel,
}));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: mockGoogleGenerativeAI,
}));

function createResponse(text: string) {
  return {
    response: {
      text: jest.fn().mockResolvedValue(text),
    },
  };
}

describe('services/llm-client', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGenerateContent.mockReset();
    mockGetGenerativeModel.mockClear();
    mockGoogleGenerativeAI.mockClear();
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });

  it('analyzeRepository validates structured output and returns data', async () => {
    const validOutput = {
      repositoryName: 'test-repo',
      summary: 'Test summary',
      projectType: 'web-app',
      estimatedRoles: ['Backend'],
      mainContributions: ['Implemented API'],
      techStack: ['Node.js'],
      leadershipSignals: [],
      confidence: 0.8,
    };

    mockGenerateContent.mockResolvedValueOnce(createResponse(JSON.stringify(validOutput)));

    const { analyzeRepository } = await import('../../services/llm-client');

    const input: RepositoryAnalysisInput = {
      repositoryName: 'test-repo',
      readme: '# Test',
    };

    const result = await analyzeRepository(input);

    expect(result).toEqual(validOutput);
    expect(mockGoogleGenerativeAI).toHaveBeenCalledWith('test-gemini-key');
    expect(mockGetGenerativeModel).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 16384,
        responseMimeType: 'application/json',
      },
    });
  });

  it('analyzeRepository retries on malformed JSON and succeeds', async () => {
    const validOutput = {
      repositoryName: 'retry-repo',
      summary: 'Retry summary',
      projectType: 'cli',
      estimatedRoles: ['DevOps'],
      mainContributions: ['Automation'],
      techStack: ['Bash'],
      leadershipSignals: [],
      confidence: 0.6,
    };

    mockGenerateContent
      .mockResolvedValueOnce(createResponse('not-json'))
      .mockResolvedValueOnce(createResponse(JSON.stringify(validOutput)));

    const { analyzeRepository } = await import('../../services/llm-client');

    const input: RepositoryAnalysisInput = {
      repositoryName: 'retry-repo',
    };

    const result = await analyzeRepository(input);

    expect(result).toEqual(validOutput);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('analyzeRepository throws GeminiAPIError after max retries on schema mismatch', async () => {
    const invalidOutput = {
      repositoryName: 'bad-repo',
      summary: 'Missing fields',
    };

    mockGenerateContent
      .mockResolvedValueOnce(createResponse(JSON.stringify(invalidOutput)))
      .mockResolvedValueOnce(createResponse(JSON.stringify(invalidOutput)))
      .mockResolvedValueOnce(createResponse(JSON.stringify(invalidOutput)));

    const { analyzeRepository } = await import('../../services/llm-client');

    const input: RepositoryAnalysisInput = {
      repositoryName: 'bad-repo',
    };

    const promise = analyzeRepository(input);
    await expect(promise).rejects.toMatchObject({
      name: 'GeminiAPIError',
    });
    await expect(promise).rejects.toThrow('Schema validation failed');
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
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

    mockGenerateContent.mockResolvedValueOnce(createResponse(JSON.stringify(validOutput)));

    const { aggregateProfile } = await import('../../services/llm-client');

    const input: ProfileAggregationInput = {
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

    const result = await aggregateProfile(input);

    expect(result).toEqual(validOutput);
  });

  it('aggregateProfile retries on timeout and throws after max retries', async () => {
    jest.useFakeTimers();

    mockGenerateContent.mockImplementation(() => new Promise(() => {}));

    const { aggregateProfile } = await import('../../services/llm-client');

    const input: ProfileAggregationInput = {
      username: 'timeout-user',
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

    const promise = aggregateProfile(input);
    const rejection = expect(promise).rejects.toMatchObject({ name: 'GeminiAPIError' });

    await jest.advanceTimersByTimeAsync(ANALYSIS_TIMEOUT_MS * 3 + 50);

    await rejection;
    await expect(promise).rejects.toThrow('Gemini request timed out');
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);

    jest.useRealTimers();
  });
});
