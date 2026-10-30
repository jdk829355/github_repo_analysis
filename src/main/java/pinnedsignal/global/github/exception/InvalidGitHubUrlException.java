package pinnedsignal.global.github.exception;

// 메시지는 화면에 그대로 보이는 문구다.
public class InvalidGitHubUrlException extends RuntimeException {

    public static final String EMPTY_MESSAGE = "GitHub 프로필 URL을 입력해주세요";
    public static final String INVALID_MESSAGE = "올바른 GitHub 프로필 URL을 입력해주세요";

    public InvalidGitHubUrlException(String message) {
        super(message);
    }
}
