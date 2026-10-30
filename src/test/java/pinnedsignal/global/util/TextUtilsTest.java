package pinnedsignal.global.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class TextUtilsTest {

    @Test
    void returnsOriginalTextWithinMaxBytes() {
        assertThat(TextUtils.truncateToMaxSize("Hello, World!", 100)).isEqualTo("Hello, World!");
        assertThat(TextUtils.truncateToMaxSize("", 100)).isEmpty();
    }

    @Test
    void truncatesByUtf8BytesWithoutSplittingCharacters() {
        assertThat(TextUtils.truncateToMaxSize("Hello, World! This is a longer string", 20))
                .isEqualTo("Hello, World! This i");
        // 👋는 4바이트라서 "Hello "(6) + 👋(4) + " Worl"(5)이 15바이트다.
        String truncated = TextUtils.truncateToMaxSize("Hello 👋 World 🌍", 15);
        assertThat(truncated).isEqualTo("Hello 👋 Worl");
        // 문자 중간에서는 자르지 않는다. 👋 앞에서 9바이트면 👋를 통째로 뺀다.
        assertThat(TextUtils.truncateToMaxSize("Hello 👋", 9)).isEqualTo("Hello ");
        assertThat(truncated.getBytes(StandardCharsets.UTF_8)).hasSizeLessThanOrEqualTo(15);
        assertThat(TextUtils.truncateToMaxSize("한글", 4)).isEqualTo("한");
        assertThat(TextUtils.truncateToMaxSize("abc", 0)).isEmpty();
    }
}
