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

export class GeminiAPIError extends Error {
  public readonly statusCode: number;
  public readonly rawResponse?: string;

  constructor(message: string, statusCode: number, rawResponse?: string) {
    super(message);
    this.name = 'GeminiAPIError';
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

export class ValidationError extends Error {
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    Error.captureStackTrace(this, this.constructor);
  }
}
