package pinnedsignal.global.llm.service;

import com.openai.client.OpenAIClient;
import com.openai.errors.OpenAIIoException;
import com.openai.errors.OpenAIServiceException;
import com.openai.models.ResponseFormatJsonObject;
import com.openai.models.chat.completions.ChatCompletion;
import com.openai.models.chat.completions.ChatCompletionCreateParams;
import com.openai.models.completions.CompletionUsage;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import java.io.InterruptedIOException;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import pinnedsignal.global.common.AnalysisConstants;
import pinnedsignal.global.common.Sleeper;
import pinnedsignal.global.config.LlmProperties;
import pinnedsignal.global.llm.dto.ProfileAggregationInput;
import pinnedsignal.global.llm.dto.ProfileReportResponse;
import pinnedsignal.global.llm.dto.RepositoryAnalysisInput;
import pinnedsignal.global.llm.dto.RepositoryAnalysisResponse;
import pinnedsignal.global.llm.exception.LlmApiException;
import pinnedsignal.global.llm.prompt.ProfileAggregationPrompt;
import pinnedsignal.global.llm.prompt.RepositoryAnalysisPrompt;
import pinnedsignal.global.util.TextUtils;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.cfg.CoercionAction;
import tools.jackson.databind.cfg.CoercionInputShape;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.type.LogicalType;

// services/llm-client.ts를 옮긴 것. 응답 JSON이 깨졌거나 스키마에 안 맞으면 1초, 2초 쉬고 두 번 더 요청한다.
@Slf4j
@Service
@RequiredArgsConstructor
public class LlmClient {

    private static final double TEMPERATURE = 0.1;
    private static final long MAX_OUTPUT_TOKENS = 16384;
    private static final int MAX_RETRIES = 2;
    private static final long RETRY_BASE_DELAY_MS = 1000;
    private static final Pattern CODE_BLOCK = Pattern.compile("^```(?:json)?\\s*([\\s\\S]*?)\\s*```\\z");

    // zod처럼 타입이 다르면 실패시킨다. Jackson 기본값은 숫자를 문자열로, "0.5"를 숫자로 바꿔 받는다.
    private static final JsonMapper STRICT_JSON = JsonMapper.builder()
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .withCoercionConfig(LogicalType.Textual, config -> config
                    .setCoercion(CoercionInputShape.Integer, CoercionAction.Fail)
                    .setCoercion(CoercionInputShape.Float, CoercionAction.Fail)
                    .setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail))
            .withCoercionConfig(LogicalType.Float, config -> config
                    .setCoercion(CoercionInputShape.String, CoercionAction.Fail)
                    .setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail))
            .build();

    private final OpenAIClient openAiClient;
    private final LlmProperties llmProperties;
    private final Validator validator;
    private final Sleeper sleeper;
    private final RepositoryAnalysisPrompt repositoryAnalysisPrompt;
    private final ProfileAggregationPrompt profileAggregationPrompt;

    private enum CallKind {
        REPOSITORY("repository"), PROFILE("profile");

        private final String label;

        CallKind(String label) {
            this.label = label;
        }
    }

    private record LlmResponse(String content, String finishReason) {
    }

    public RepositoryAnalysisResponse analyzeRepository(RepositoryAnalysisInput input) {
        String prompt = repositoryAnalysisPrompt.render(normalizeRepositoryInput(input));
        return callLlmWithRetry(prompt, RepositoryAnalysisResponse.class, CallKind.REPOSITORY);
    }

    public ProfileReportResponse aggregateProfile(ProfileAggregationInput input) {
        String prompt = profileAggregationPrompt.render(input);
        return callLlmWithRetry(prompt, ProfileReportResponse.class, CallKind.PROFILE);
    }

    private static RepositoryAnalysisInput normalizeRepositoryInput(RepositoryAnalysisInput input) {
        if (input.readme() == null || input.readme().isEmpty()) {
            return input;
        }
        return input.withReadme(TextUtils.truncateToMaxSize(input.readme(), AnalysisConstants.README_MAX_SIZE_BYTES));
    }

    private <T> T callLlmWithRetry(String prompt, Class<T> type, CallKind kind) {
        LlmApiException lastError = null;

        for (int attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                sleeper.sleep(RETRY_BASE_DELAY_MS * (1L << (attempt - 1)));
            }

            // SDK가 이미 재시도한 오류이므로 여기서는 다시 시도하지 않고 그대로 던진다.
            LlmResponse response = generateJsonResponse(prompt, kind);

            try {
                return parseAndValidate(response.content(), type);
            } catch (LlmApiException error) {
                lastError = error;
                // finishReason이 length이면 max_tokens에 걸려 응답이 잘린 것이다.
                log.atWarn()
                        .addKeyValue("event", "llm.invalid_response")
                        .addKeyValue("kind", kind.label)
                        .addKeyValue("attempt", attempt + 1)
                        .addKeyValue("reason", error.getMessage())
                        .addKeyValue("rawResponseLength", response.content().length())
                        .addKeyValue("finishReason", response.finishReason())
                        .log("LLM response did not match the expected JSON");
            }
        }

        throw lastError;
    }

    // maxTokens는 deprecated지만 지금처럼 max_tokens를 보낸다. OpenAI 호환 업체 중 max_completion_tokens를 모르는 곳이 있다.
    @SuppressWarnings("deprecation")
    private LlmResponse generateJsonResponse(String prompt, CallKind kind) {
        String model = llmProperties.model();
        long startedAt = System.currentTimeMillis();

        ChatCompletionCreateParams params = ChatCompletionCreateParams.builder()
                .model(model)
                .addUserMessage(prompt)
                .temperature(TEMPERATURE)
                .maxTokens(MAX_OUTPUT_TOKENS)
                .responseFormat(ResponseFormatJsonObject.builder().build())
                .build();

        ChatCompletion completion;
        try {
            completion = openAiClient.chat().completions().create(params);
        } catch (OpenAIServiceException error) {
            throw new LlmApiException("LLM API error: " + error.getMessage(), error.statusCode());
        } catch (OpenAIIoException error) {
            if (isTimeout(error)) {
                throw new LlmApiException("LLM request timed out", 408);
            }
            throw new LlmApiException("LLM connection failed", 503);
        }

        ChatCompletion.Choice choice = completion.choices().isEmpty() ? null : completion.choices().getFirst();
        String finishReason = choice == null ? null : choice.finishReason().asString();
        CompletionUsage usage = completion.usage().orElse(null);

        // 프롬프트와 응답 본문은 남기지 않는다. 비용 추적용 토큰 수만 남긴다.
        log.atInfo()
                .addKeyValue("event", "llm.call")
                .addKeyValue("kind", kind.label)
                .addKeyValue("model", model)
                .addKeyValue("durationMs", System.currentTimeMillis() - startedAt)
                .addKeyValue("finishReason", finishReason)
                .addKeyValue("promptTokens", usage == null ? null : usage.promptTokens())
                .addKeyValue("completionTokens", usage == null ? null : usage.completionTokens())
                .addKeyValue("totalTokens", usage == null ? null : usage.totalTokens())
                .log("LLM call completed");

        String content = choice == null ? "" : choice.message().content().orElse("");
        return new LlmResponse(content, finishReason);
    }

    private static boolean isTimeout(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof InterruptedIOException) {
                return true;
            }
        }
        return false;
    }

    private static String extractJson(String text) {
        String trimmed = text.strip();
        Matcher codeBlock = CODE_BLOCK.matcher(trimmed);
        if (codeBlock.find()) {
            return codeBlock.group(1).strip();
        }
        return trimmed;
    }

    private <T> T parseAndValidate(String rawText, Class<T> type) {
        JsonNode json;
        try {
            json = STRICT_JSON.readTree(extractJson(rawText));
        } catch (JacksonException error) {
            throw new LlmApiException("Malformed JSON from LLM", 422, rawText);
        }
        if (json == null || json.isMissingNode()) {
            throw new LlmApiException("Malformed JSON from LLM", 422, rawText);
        }

        T data;
        try {
            data = STRICT_JSON.treeToValue(json, type);
        } catch (JacksonException error) {
            throw new LlmApiException("Schema validation failed", 422, rawText);
        }
        Set<ConstraintViolation<T>> violations = data == null ? Set.of() : validator.validate(data);
        if (data == null || !violations.isEmpty()) {
            throw new LlmApiException("Schema validation failed", 422, rawText);
        }
        return data;
    }
}
