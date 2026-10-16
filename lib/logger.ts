import pino from 'pino';

const REDACTED = '[REDACTED]';

// 객체로 넘긴 필드 중 비밀값이나 프롬프트처럼 남기면 안 되는 경로를 가린다.
const REDACT_PATHS = [
  'authorization',
  '*.authorization',
  'headers.authorization',
  '*.headers.authorization',
  'apiKey',
  '*.apiKey',
  'token',
  '*.token',
  'password',
  '*.password',
  'prompt',
  '*.prompt',
];

// 외부 API 에러 메시지처럼 내용을 통제할 수 없는 문자열에서 비밀값 형태를 지운다.
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/gh[pousr]_[A-Za-z0-9]{20,}/g, REDACTED],
  [/github_pat_[A-Za-z0-9_]{20,}/g, REDACTED],
  [/sk-[A-Za-z0-9_-]{20,}/g, REDACTED],
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`],
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^:/\s@]+:)[^@\s]+@/gi, `$1${REDACTED}@`],
];

export function scrubSecrets(text: string): string {
  return SECRET_PATTERNS.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    text
  );
}

function serializeError(error: unknown): Record<string, unknown> {
  if (typeof error !== 'object' || error === null) {
    return { message: scrubSecrets(String(error)) };
  }

  const serialized: Record<string, unknown> = { ...pino.stdSerializers.err(error as Error) };

  // LLMAPIError.rawResponse는 사용자 분석 결과 전문이라 길이만 남긴다.
  if (typeof serialized.rawResponse === 'string') {
    serialized.rawResponseLength = serialized.rawResponse.length;
  }
  delete serialized.rawResponse;

  if (typeof serialized.message === 'string') {
    serialized.message = scrubSecrets(serialized.message);
  }
  if (typeof serialized.stack === 'string') {
    serialized.stack = scrubSecrets(serialized.stack);
  }

  return serialized;
}

function resolveLevel(): string {
  return process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info');
}

export function createLogger(destination?: pino.DestinationStream): pino.Logger {
  return pino(
    {
      level: resolveLevel(),
      // 컨테이너 이름은 수집기가 붙이므로 pid·hostname은 남기지 않는다.
      base: null,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
      },
      serializers: { err: serializeError },
      redact: { paths: REDACT_PATHS, censor: REDACTED },
    },
    destination
  );
}

export const logger = createLogger();
