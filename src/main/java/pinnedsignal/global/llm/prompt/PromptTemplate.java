package pinnedsignal.global.llm.prompt;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import org.springframework.core.io.ClassPathResource;

/**
 * resources/prompts/*.txt를 읽어 {{userPrompt}} 자리에 사용자 입력 부분을 넣는다.
 * 파일 내용은 prompts/*.ts의 고정 문구와 한 글자도 다르면 안 된다. 문구가 바뀌면 응답 품질이 달라진다.
 */
final class PromptTemplate {

    private static final String PLACEHOLDER = "{{userPrompt}}";

    private final String template;

    PromptTemplate(String path) {
        try {
            this.template = new ClassPathResource(path).getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("prompt template not found: " + path, e);
        }
        if (!template.contains(PLACEHOLDER)) {
            throw new IllegalStateException("prompt template has no " + PLACEHOLDER + ": " + path);
        }
    }

    String render(String userPrompt) {
        return template.replace(PLACEHOLDER, userPrompt);
    }

    // JS의 `${number}`와 같은 모양으로 숫자를 쓴다. 1.0은 "1", 0.85는 "0.85"다.
    static String formatNumber(double value) {
        if (value == Math.rint(value) && !Double.isInfinite(value)) {
            return Long.toString((long) value);
        }
        return Double.toString(value);
    }

    // JS 조건문의 truthy 판단. null과 빈 문자열은 거짓이다.
    static boolean hasText(String value) {
        return value != null && !value.isEmpty();
    }
}
