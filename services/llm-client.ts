import OpenAI, { APIConnectionError, APIConnectionTimeoutError, APIError } from 'openai';
import { getLlmApiKey, getLlmBaseUrl, getLlmModel } from '../lib/config';
import { LLMAPIError } from '../lib/errors';
import { logger } from '../lib/logger';
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

type LlmCallKind = 'repository' | 'profile';

type LlmResponse = {
  content: string;
  finishReason: string | null;
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

async function generateJsonResponse(prompt: string, kind: LlmCallKind): Promise<LlmResponse> {
  const model = getLlmModel();
  const startedAt = Date.now();

  try {
    const completion = await createClient().chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: TEMPERATURE,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: { type: 'json_object' },
    });
    const choice = completion.choices[0];
    const finishReason = choice?.finish_reason ?? null;

    // 프롬프트와 응답 본문은 남기지 않는다. 비용 추적용 토큰 수만 남긴다.
    logger.info(
      {
        event: 'llm.call',
        kind,
        model,
        durationMs: Date.now() - startedAt,
        finishReason,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens,
      },
      'LLM call completed'
    );

    return { content: choice?.message?.content ?? '', finishReason };
  } catch (error) {
    if (error instanceof APIError) {
      throw toLlmError(error);
    }
    throw error;
  }
}

async function callLlmWithRetry<T>(
  prompt: string,
  schema: { parse: (data: unknown) => T },
  kind: LlmCallKind
): Promise<ParsedOutput<T>> {
  let lastError: LLMAPIError | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }

    // SDK가 이미 재시도한 오류이므로 여기서는 다시 시도하지 않고 그대로 던진다.
    const { content: rawText, finishReason } = await generateJsonResponse(prompt, kind);

    try {
      const data = schema.parse(parseJson(rawText));
      return { data, rawText };
    } catch (error) {
      lastError =
        error instanceof LLMAPIError
          ? error
          : new LLMAPIError('Schema validation failed', 422, rawText);
      // finishReason이 length이면 max_tokens에 걸려 응답이 잘린 것이다.
      logger.warn(
        {
          event: 'llm.invalid_response',
          kind,
          attempt: attempt + 1,
          reason: lastError.message,
          rawResponseLength: rawText.length,
          finishReason,
        },
        'LLM response did not match the expected JSON'
      );
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
  const result = await callLlmWithRetry(prompt, RepositoryAnalysisSchema, 'repository');
  return result.data;
}

export async function aggregateProfile(
  input: ProfileAggregationInput
): Promise<ProfileReport> {
  const prompt = profileAggregation.render(input);
  const result = await callLlmWithRetry(prompt, ProfileReportSchema, 'profile');
  return result.data;
}
