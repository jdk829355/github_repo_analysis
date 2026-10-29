package pinnedsignal.global.exception;

import java.util.regex.Pattern;
import pinnedsignal.global.github.exception.GitHubApiException;

// 사용자에게는 정해진 문구만 보낸다. 원본 메시지는 서버 로그(job.failed, repo.failed)에만 남는다. lib/errors.ts와 같다.
public final class UserMessages {

    public static final String INTERNAL_ERROR_MESSAGE = "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";

    private static final Pattern RATE_LIMIT = Pattern.compile("rate limit", Pattern.CASE_INSENSITIVE);

    private UserMessages() {
    }

    public static String toUserMessage(Throwable error) {
        if (error instanceof AnalysisException analysisError) {
            String message = analysisError.getMessage();
            if ("No pinned repositories found".equals(message)) {
                return "고정(pinned)된 저장소가 없어 분석할 수 없습니다.";
            }
            if ("no eligible repositories".equals(message)) {
                return "분석할 수 있는 저장소가 없습니다.";
            }
            if (message != null && message.startsWith("Analysis timed out")) {
                return "분석 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
            }
        }
        if (error instanceof GitHubApiException gitHubError
                && gitHubError.getMessage() != null
                && RATE_LIMIT.matcher(gitHubError.getMessage()).find()) {
            return "GitHub API 사용 한도를 넘었습니다. 잠시 후 다시 시도해주세요.";
        }
        return "분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    }
}
