export interface Commit {
  message: string;
  sha?: string;
}

const REGEX_PATTERNS = [
  /^merge/i,
  /^merged/i,
  /^typo/i,
  /^fix\s+lint/i,
  /^lint/i,
  /^format/i,
  /^prettier/i,
  /^eslint/i,
  /^style/i,
  /^docs/i,
  /^doc/i,
  /^readme/i,
  /^bump/i,
  /^chore/i,
  /^update\s+dependency/i,
  /^dependabot/i,
  /^[0-9]{4}[-/][0-9]{2}[-/][0-9]{2}/,
  /^[0-9]{6,8}$/,
  /^wip$/i,
  /^temp$/i,
] as const;

function matchesRegexPatterns(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return REGEX_PATTERNS.some((pattern) => pattern.test(lowerMessage));
}

function isOneWordCommit(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length === 0 || trimmed.indexOf(' ') !== -1) {
    return false;
  }
  const isAsciiWord = /^[a-zA-Z]+$/.test(trimmed);
  return isAsciiWord && trimmed.length <= 6;
}

function isDependencyUpdate(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return /^update\s+(.+)?dependenc(y|ies)/i.test(lowerMessage) ||
         /^bump\s+.+(?:\s+to\s+|\s+-\s+)/i.test(lowerMessage) ||
         /^[a-z]+-\d+\.\d+\.\d+/i.test(lowerMessage) ||
         (lowerMessage.startsWith('update') && /lodash|react|npm|package|version/i.test(message));
}

function isArchiveOrMemo(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return /^archive/i.test(lowerMessage) || /^memo/i.test(lowerMessage);
}

function isFormattingOnly(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return /^format(ting)?(\s+only)?$/i.test(lowerMessage);
}

export function isMergeCommit(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return /^merge/i.test(lowerMessage);
}

export function isMeaningfulCommit(message: string): boolean {
  if (!message || message.trim().length === 0) {
    return false;
  }

  if (matchesRegexPatterns(message)) {
    return false;
  }

  if (isOneWordCommit(message)) {
    return false;
  }

  if (isDependencyUpdate(message)) {
    return false;
  }

  if (isArchiveOrMemo(message)) {
    return false;
  }

  if (isFormattingOnly(message)) {
    return false;
  }

  return true;
}

export function filterCommits<T extends Commit>(commits: T[]): T[] {
  return commits.filter((commit) => {
    return !isMergeCommit(commit.message) && isMeaningfulCommit(commit.message);
  });
}