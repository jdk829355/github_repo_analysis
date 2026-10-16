import OpenAI, { APIConnectionError, APIConnectionTimeoutError, APIError } from 'openai';
import { getLlmApiKey, getLlmBaseUrl, getLlmModel } from '../lib/config';
import { LLMAPIError } from '../lib/errors';
import { LLM_REQUEST_TIMEOUT_MS, README_MAX_SIZE_BYTES } from '../lib/constants';
import { truncateToMaxSize } from '../lib/utils';
import { repositoryAnalysis } from '../prompts/repository-analysis';
import { profileAggregation } from '../prompts/profile-aggregation';
import {
  RepositoryAnalysisSchema,
  type RepositoryAnalysis,
} from '../schemas/repository-analysis';
import {
  ProfileReportSchema,
  type ProfileReport,
} from '../schemas/profile-report';
import type {
  RepositoryAnalysisInput,
  ProfileAggregationInput,
} from '../prompts/types';

const TEMPERATURE = 0.1;
const MAX_OUTPUT_TOKENS = 16384;
const SDK_MAX_RETRIES = 2;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1000;

type ParsedOutput<T> = {
  data: T;
  rawText: string;
};

function createClient(): OpenAI {
  return new OpenAI({
    baseURL: getLlmBaseUrl(),
    apiKey: getLlmApiKey(),
    timeout: LLM_REQUEST_TIMEOUT_MS,
    maxRetries: SDK_MAX_RETRIES,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toLlmError(error: APIError): LLMAPIError {
  if (error instanceof APIConnectionTimeoutError) {
    return new LLMAPIError('LLM request timed out', 408);
  }
  if (error instanceof APIConnectionError) {
    return new LLMAPIError('LLM connection failed', 503);
  }
  return new LLMAPIError(`LLM API error: ${error.message}`, error.status ?? 500);
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const codeBlockMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  return trimmed;
}

function parseJson(text: string): unknown {
  const jsonText = extractJson(text);
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new LLMAPIError('Malformed JSON from LLM', 422, text);
  }
}

async function generateJsonResponse(prompt: string): Promise<string> {
  try {
    const completion = await createClient().chat.completions.create({
      model: getLlmModel(),
      messages: [{ role: 'user', content: prompt }],
      temperature: TEMPERATURE,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: { type: 'json_object' },
    });
    return completion.choices[0]?.message?.content ?? '';
  } catch (error) {
    if (error instanceof APIError) {
      throw toLlmError(error);
    }
    throw error;
  }
}

async function callLlmWithRetry<T>(
  prompt: string,
  schema: { parse: (data: unknown) => T }
): Promise<ParsedOutput<T>> {
  let lastError: LLMAPIError | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }

    // SDK가 이미 재시도한 오류이므로 여기서는 다시 시도하지 않고 그대로 던진다.
    const rawText = await generateJsonResponse(prompt);

    try {
      const data = schema.parse(parseJson(rawText));
      return { data, rawText };
    } catch (error) {
      lastError =
        error instanceof LLMAPIError
          ? error
          : new LLMAPIError('Schema validation failed', 422, rawText);
    }
  }

  throw lastError!;
}

function normalizeRepositoryInput(input: RepositoryAnalysisInput): RepositoryAnalysisInput {
  if (!input.readme) {
    return input;
  }

  return {
    ...input,
    readme: truncateToMaxSize(input.readme, README_MAX_SIZE_BYTES),
  };
}

export async function analyzeRepository(
  input: RepositoryAnalysisInput
): Promise<RepositoryAnalysis> {
  const normalizedInput = normalizeRepositoryInput(input);
  const prompt = repositoryAnalysis.render(normalizedInput);
  const result = await callLlmWithRetry(prompt, RepositoryAnalysisSchema);
  return result.data;
}

export async function aggregateProfile(
  input: ProfileAggregationInput
): Promise<ProfileReport> {
  const prompt = profileAggregation.render(input);
  const result = await callLlmWithRetry(prompt, ProfileReportSchema);
  return result.data;
}
