import { AnalysisError, GitHubAPIError, LLMAPIError, toUserMessage } from '../../lib/errors';

describe('lib/errors toUserMessage', () => {
  it.each([
    [new AnalysisError('No pinned repositories found', 'fetch'), '고정(pinned)된 저장소가 없어 분석할 수 없습니다.'],
    [new AnalysisError('no eligible repositories', 'aggregate'), '분석할 수 있는 저장소가 없습니다.'],
    [
      new AnalysisError('Analysis timed out after 600000ms', 'aggregate'),
      '분석 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.',
    ],
    [
      new GitHubAPIError('API rate limit exceeded for user ID 1.', 403, '/users/testuser'),
      'GitHub API 사용 한도를 넘었습니다. 잠시 후 다시 시도해주세요.',
    ],
  ])('maps a known error to its message (%#)', (error, expected) => {
    expect(toUserMessage(error)).toBe(expected);
  });

  it.each([
    new LLMAPIError('LLM API error: 401 bad key', 401, 'raw'),
    new GitHubAPIError('Bad credentials', 401, '/users/testuser'),
    new Error('connect ECONNREFUSED db.example.supabase.co:5432'),
    'not an error',
  ])('hides the original message of other errors (%#)', (error) => {
    expect(toUserMessage(error)).toBe('분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
  });
});
