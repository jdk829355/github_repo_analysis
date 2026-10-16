import { ValidationError } from './errors';
import { GITHUB_API_VERSION } from './constants';

function getRequiredEnv(envVar: string): string {
  const value = process.env[envVar];
  if (!value) {
    throw new ValidationError(`${envVar} environment variable is not set`);
  }
  return value;
}

export function getGitHubToken(): string {
  return getRequiredEnv('GITHUB_TOKEN');
}

export function getLlmBaseUrl(): string {
  return getRequiredEnv('LLM_BASE_URL');
}

export function getLlmApiKey(): string {
  return getRequiredEnv('LLM_API_KEY');
}

export function getLlmModel(): string {
  return getRequiredEnv('LLM_MODEL');
}

export function getDatabaseUrl(): string {
  return getRequiredEnv('DATABASE_URL');
}

export function getRedisUrl(): string {
  return getRequiredEnv('REDIS_URL');
}

export function getAppUrl(): string {
  return getRequiredEnv('NEXT_PUBLIC_APP_URL');
}

export function getGithubApiVersion(): string {
  return GITHUB_API_VERSION;
}
