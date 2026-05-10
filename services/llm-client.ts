import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiApiKey } from '../lib/config';
import { GeminiAPIError } from '../lib/errors';
import { ANALYSIS_TIMEOUT_MS, README_MAX_SIZE_BYTES } from '../lib/constants';
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

const MODEL_NAME = 'gemini-2.5-flash-lite';
const TEMPERATURE = 0.1;
const MAX_RETRIES = 2;

type ParsedOutput<T> = {
  data: T;
  rawText: string;
};

function createClient(): GoogleGenerativeAI {
  return new GoogleGenerativeAI(getGeminiApiKey());
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new GeminiAPIError('Gemini request timed out', 408));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
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
    throw new GeminiAPIError('Malformed JSON from Gemini', 422, text);
  }
}

async function generateJsonResponse(prompt: string): Promise<string> {
  const client = createClient();
  const model = client.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: { temperature: TEMPERATURE, maxOutputTokens: 16384, responseMimeType: 'application/json' },
  });

  const result = await withTimeout(model.generateContent(prompt), ANALYSIS_TIMEOUT_MS);
  return result.response.text();
}

async function callGeminiWithRetry<T>(
  prompt: string,
  schema: { parse: (data: unknown) => T }
): Promise<ParsedOutput<T>> {
  let lastError: GeminiAPIError | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let rawText: string | undefined;
    try {
      rawText = await generateJsonResponse(prompt);
      const parsedJson = parseJson(rawText);
      const data = schema.parse(parsedJson);
      return { data, rawText };
    } catch (error) {
      if (error instanceof GeminiAPIError) {
        lastError = error;
      } else if (error instanceof Error) {
        lastError = new GeminiAPIError('Schema validation failed', 422, rawText);
      } else {
        lastError = new GeminiAPIError('Unknown Gemini error', 500, rawText);
      }

      if (attempt >= MAX_RETRIES) {
        break;
      }
    }
  }

  throw lastError || new GeminiAPIError('Gemini request failed after retries', 500);
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
  const result = await callGeminiWithRetry(prompt, RepositoryAnalysisSchema);
  return result.data;
}

export async function aggregateProfile(
  input: ProfileAggregationInput
): Promise<ProfileReport> {
  const prompt = profileAggregation.render(input);
  const result = await callGeminiWithRetry(prompt, ProfileReportSchema);
  return result.data;
}
