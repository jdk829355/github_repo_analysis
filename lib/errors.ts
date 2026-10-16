export class GitHubAPIError extends Error {
  public readonly statusCode: number;
  public readonly endpoint: string;

  constructor(message: string, statusCode: number, endpoint: string) {
    super(message);
    this.name = 'GitHubAPIError';
    this.statusCode = statusCode;
    this.endpoint = endpoint;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class LLMAPIError extends Error {
  public readonly statusCode: number;
  public readonly rawResponse?: string;

  constructor(message: string, statusCode: number, rawResponse?: string) {
    super(message);
    this.name = 'LLMAPIError';
    this.statusCode = statusCode;
    this.rawResponse = rawResponse;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AnalysisError extends Error {
  public readonly repository?: string;
  public readonly phase: 'fetch' | 'parse' | 'aggregate' | 'generate';

  constructor(
    message: string,
    phase: 'fetch' | 'parse' | 'aggregate' | 'generate',
    repository?: string
  ) {
    super(message);
    this.name = 'AnalysisError';
    this.phase = phase;
    this.repository = repository;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const INTERNAL_ERROR_MESSAGE = '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';

// 사용자에게는 정해진 문구만 보낸다. 원본 메시지는 서버 로그(job.failed, repo.failed)에만 남는다.
export function toUserMessage(error: unknown): string {
  if (error instanceof AnalysisError) {
    if (error.message === 'No pinned repositories found') {
      return '고정(pinned)된 저장소가 없어 분석할 수 없습니다.';
    }
    if (error.message === 'no eligible repositories') {
      return '분석할 수 있는 저장소가 없습니다.';
    }
    if (error.message.startsWith('Analysis timed out')) {
      return '분석 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
    }
  }
  if (error instanceof GitHubAPIError && /rate limit/i.test(error.message)) {
    return 'GitHub API 사용 한도를 넘었습니다. 잠시 후 다시 시도해주세요.';
  }
  return '분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
}

export class ValidationError extends Error {
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    Error.captureStackTrace(this, this.constructor);
  }
}
