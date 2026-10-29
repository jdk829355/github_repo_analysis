package pinnedsignal.global.config;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

// 업체를 가정하지 않는다. OpenAI 호환 API면 base URL만 바꿔 쓴다.
@Validated
@ConfigurationProperties(prefix = "llm")
public record LlmProperties(
        @NotBlank(message = "LLM_BASE_URL environment variable is not set") String baseUrl,
        @NotBlank(message = "LLM_API_KEY environment variable is not set") String apiKey,
        @NotBlank(message = "LLM_MODEL environment variable is not set") String model) {
}
