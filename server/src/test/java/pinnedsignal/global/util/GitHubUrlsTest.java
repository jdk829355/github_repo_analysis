package pinnedsignal.global.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import pinnedsignal.global.github.exception.InvalidGitHubUrlException;

// tests/lib/utils.test.ts의 normalizeGitHubUrl 사례를 옮긴 것.
class GitHubUrlsTest {

    @ParameterizedTest
    @ValueSource(strings = {
            "https://github.com/username/",
            "https://github.com/username",
            "github.com/username",
            "github.com/username/",
            "username",
            "  username  ",
            "username\n",
            " username ",
    })
    void normalizesToHttpsProfileUrl(String input) {
        assertThat(GitHubUrls.normalize(input)).isEqualTo("https://github.com/username");
    }

    @Test
    void emptyInputHasItsOwnMessage() {
        assertThatThrownBy(() -> GitHubUrls.normalize("")).hasMessage(InvalidGitHubUrlException.EMPTY_MESSAGE);
        assertThatThrownBy(() -> GitHubUrls.normalize("   ")).hasMessage(InvalidGitHubUrlException.EMPTY_MESSAGE);
        assertThatThrownBy(() -> GitHubUrls.normalize(null)).hasMessage(InvalidGitHubUrlException.EMPTY_MESSAGE);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "not--valid",
            "-leading",
            "trailing-",
            "has space",
            "http://github.com/username",
            "www.github.com/username",
            "https://github.com/username/repo",
            "https://gitlab.com/username",
            "https://github.com/",
            "a234567890123456789012345678901234567890",
    })
    void rejectsInvalidProfiles(String input) {
        assertThatThrownBy(() -> GitHubUrls.normalize(input))
                .isInstanceOf(InvalidGitHubUrlException.class)
                .hasMessage(InvalidGitHubUrlException.INVALID_MESSAGE);
    }

    @Test
    void acceptsTheLongestUsername() {
        String longest = "a".repeat(39);

        assertThat(GitHubUrls.normalize(longest)).isEqualTo("https://github.com/" + longest);
    }

    @Test
    void buildsAndSplitsProfileUrl() {
        assertThat(GitHubUrls.usernameOf("https://github.com/octocat")).isEqualTo("octocat");
        assertThat(GitHubUrls.profileUrlOf("octocat")).isEqualTo("https://github.com/octocat");
    }
}
