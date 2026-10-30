package pinnedsignal.global.util;

import java.util.regex.Pattern;
import pinnedsignal.global.github.exception.InvalidGitHubUrlException;

// lib/utils.ts의 normalizeGitHubUrl을 옮긴 것. 입력은 https://github.com/{username} 형태로 맞춘다.
public final class GitHubUrls {

    private static final String PROFILE_PREFIX = "https://github.com/";
    private static final Pattern TRAILING_SLASHES = Pattern.compile("/+\\z");
    // JS의 $는 문자열 끝에서만 맞으므로 matches()로 전체를 비교한다.
    private static final Pattern PROFILE_URL =
            Pattern.compile("https://github\\.com/[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}");

    private GitHubUrls() {
    }

    public static String normalize(String url) {
        // JS의 trim()과 같은 공백 기준으로 앞뒤를 자른다. 안쪽 공백은 어차피 형식 검사에서 걸러진다.
        String normalized = url == null ? "" : TextUtils.collapseWhitespace(url);
        if (normalized.isEmpty()) {
            throw new InvalidGitHubUrlException(InvalidGitHubUrlException.EMPTY_MESSAGE);
        }

        if (!normalized.startsWith("http://") && !normalized.startsWith("https://")
                && !normalized.startsWith("github.com/")) {
            normalized = normalized.contains("/") ? "https://" + normalized : PROFILE_PREFIX + normalized;
        } else if (normalized.startsWith("github.com/")) {
            normalized = "https://" + normalized;
        }

        normalized = TRAILING_SLASHES.matcher(normalized).replaceAll("");

        if (!PROFILE_URL.matcher(normalized).matches()) {
            throw new InvalidGitHubUrlException(InvalidGitHubUrlException.INVALID_MESSAGE);
        }
        return normalized;
    }

    public static String profileUrlOf(String username) {
        return PROFILE_PREFIX + username;
    }

    // normalize()를 거친 URL에서 사용자 이름을 꺼낸다.
    public static String usernameOf(String githubProfile) {
        return githubProfile.substring(PROFILE_PREFIX.length());
    }
}
