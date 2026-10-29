package pinnedsignal.global.exception;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import pinnedsignal.global.exception.AnalysisException.Phase;
import pinnedsignal.global.github.exception.GitHubApiException;
import pinnedsignal.global.llm.exception.LlmApiException;

class UserMessagesTest {

    static Stream<Arguments> knownErrors() {
        return Stream.of(
                Arguments.of(new AnalysisException("No pinned repositories found", Phase.FETCH),
                        "고정(pinned)된 저장소가 없어 분석할 수 없습니다."),
                Arguments.of(new AnalysisException("no eligible repositories", Phase.AGGREGATE),
                        "분석할 수 있는 저장소가 없습니다."),
                Arguments.of(new AnalysisException("Analysis timed out after 600000ms", Phase.AGGREGATE),
                        "분석 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."),
                Arguments.of(new GitHubApiException("API rate limit exceeded for user ID 1.", 403, "/users/testuser"),
                        "GitHub API 사용 한도를 넘었습니다. 잠시 후 다시 시도해주세요."),
                Arguments.of(new GitHubApiException("You have exceeded a secondary RATE LIMIT", 403, "/graphql"),
                        "GitHub API 사용 한도를 넘었습니다. 잠시 후 다시 시도해주세요."));
    }

    @ParameterizedTest
    @MethodSource("knownErrors")
    void mapsKnownErrorsToTheirMessages(Throwable error, String expected) {
        assertThat(UserMessages.toUserMessage(error)).isEqualTo(expected);
    }

    static Stream<Throwable> otherErrors() {
        return Stream.of(
                new LlmApiException("LLM API error: 401 bad key", 401, "raw"),
                new GitHubApiException("Bad credentials", 401, "/users/testuser"),
                new IllegalStateException("connect ECONNREFUSED db.example.supabase.co:5432"),
                new AnalysisException("something else", Phase.PARSE));
    }

    @ParameterizedTest
    @MethodSource("otherErrors")
    void hidesTheOriginalMessageOfOtherErrors(Throwable error) {
        assertThat(UserMessages.toUserMessage(error)).isEqualTo("분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    }
}
