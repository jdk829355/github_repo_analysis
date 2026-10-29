package pinnedsignal.global.llm.service;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.containing;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.equalToJson;
import static com.github.tomakehurst.wiremock.client.WireMock.matchingJsonPath;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder;
import com.github.tomakehurst.wiremock.client.ScenarioMappingBuilder;
import com.github.tomakehurst.wiremock.junit5.WireMockExtension;
import com.github.tomakehurst.wiremock.stubbing.Scenario;
import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import pinnedsignal.global.config.LlmProperties;
import pinnedsignal.global.llm.dto.ProfileAggregationInput;
import pinnedsignal.global.llm.dto.ProfileReportResponse;
import pinnedsignal.global.llm.dto.RepositoryAnalysisInput;
import pinnedsignal.global.llm.dto.RepositoryAnalysisResponse;
import pinnedsignal.global.llm.exception.LlmApiException;
import pinnedsignal.global.llm.prompt.ProfileAggregationPrompt;
import pinnedsignal.global.llm.prompt.RepositoryAnalysisPrompt;
import pinnedsignal.support.LogCapture;
import tools.jackson.databind.json.JsonMapper;

class LlmClientTest {

    @RegisterExtension
    static WireMockExtension wireMock = WireMockExtension.newInstance().options(wireMockConfig().dynamicPort()).build();

    private static final String COMPLETIONS = "/v1/chat/completions";
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    private static final String VALID_REPOSITORY_OUTPUT = """
            {"repositoryName":"test-repo","summary":"Test summary","projectType":"web-app",
             "estimatedRoles":["Backend"],"mainContributions":["Implemented API"],"techStack":["Node.js"],
             "leadershipSignals":[],"confidence":0.8}""";

    private static final String VALID_PROFILE_OUTPUT = """
            {"overallSummary":"Strong backend engineer",
             "roleEstimation":{"primary":"Backend","secondary":["Technical Lead"],"recommended":["Senior Backend Engineer"]},
             "engineeringStrengths":["API design"],"collaborationPatterns":["Code reviews"],
             "greenFlags":["API design evidence"],"redFlags":["Limited testing evidence"]}""";

    private static final RepositoryAnalysisInput REPOSITORY_INPUT =
            new RepositoryAnalysisInput("test-repo", null, null, null, null, "# Test", null);

    private final List<Long> sleeps = new ArrayList<>();
    private OpenAIClient openAiClient;
    private LlmClient client;

    @BeforeEach
    void setUp() {
        // SDK 재시도를 끄고, 앱이 SDK 오류를 다시 시도하지 않는지 요청 횟수로 확인한다.
        openAiClient = OpenAIOkHttpClient.builder()
                .baseUrl(wireMock.baseUrl() + "/v1")
                .apiKey("test-llm-key")
                .maxRetries(0)
                .timeout(Duration.ofMillis(500))
                .build();
        client = newClient(openAiClient);
    }

    @AfterEach
    void tearDown() {
        openAiClient.close();
    }

    private LlmClient newClient(OpenAIClient sdk) {
        return new LlmClient(sdk, new LlmProperties("unused", "unused", "test-model"), VALIDATOR, sleeps::add,
                new RepositoryAnalysisPrompt(), new ProfileAggregationPrompt());
    }

    private static ResponseDefinitionBuilder completion(String content) {
        String body = JSON.writeValueAsString(java.util.Map.of(
                "id", "chatcmpl-1", "object", "chat.completion", "created", 1, "model", "test-model",
                "choices", List.of(java.util.Map.of(
                        "index", 0,
                        "message", content == null
                                ? java.util.Map.of("role", "assistant")
                                : java.util.Map.of("role", "assistant", "content", content),
                        "finish_reason", "stop")),
                "usage", java.util.Map.of("prompt_tokens", 120, "completion_tokens", 30, "total_tokens", 150)));
        return aResponse().withStatus(200).withHeader("Content-Type", "application/json").withBody(body);
    }

    private static void respondInOrder(ResponseDefinitionBuilder... responses) {
        for (int i = 0; i < responses.length; i++) {
            ScenarioMappingBuilder step = post(urlEqualTo(COMPLETIONS)).inScenario("llm")
                    .whenScenarioStateIs(i == 0 ? Scenario.STARTED : "step-" + i)
                    .willReturn(responses[i]);
            if (i < responses.length - 1) {
                step.willSetStateTo("step-" + (i + 1));
            }
            wireMock.stubFor(step);
        }
    }

    @Test
    void sendsTheSameRequestOptionsAsTheNodeApp() {
        respondInOrder(completion(VALID_REPOSITORY_OUTPUT));

        RepositoryAnalysisResponse result = client.analyzeRepository(REPOSITORY_INPUT);

        assertThat(result.repositoryName()).isEqualTo("test-repo");
        assertThat(result.confidence()).isEqualTo(0.8);
        wireMock.verify(1, postRequestedFor(urlEqualTo(COMPLETIONS))
                .withHeader("Authorization", equalTo("Bearer test-llm-key"))
                .withRequestBody(matchingJsonPath("$.model", equalTo("test-model")))
                .withRequestBody(matchingJsonPath("$.temperature", equalTo("0.1")))
                .withRequestBody(matchingJsonPath("$.max_tokens", equalTo("16384")))
                .withRequestBody(matchingJsonPath("$.response_format", equalToJson("{\"type\":\"json_object\"}")))
                .withRequestBody(matchingJsonPath("$.messages.length()", equalTo("1")))
                .withRequestBody(matchingJsonPath("$.messages[0].role", equalTo("user")))
                .withRequestBody(matchingJsonPath("$.messages[0].content", containing("Repository: test-repo"))));
    }

    @Test
    void aggregatesProfile() {
        respondInOrder(completion(VALID_PROFILE_OUTPUT));

        ProfileReportResponse report = client.aggregateProfile(new ProfileAggregationInput("testuser", List.of(
                new RepositoryAnalysisResponse("repo", "Summary", "api", List.of("Backend"), List.of("API"),
                        List.of("Node.js"), List.of(), 0.7))));

        assertThat(report.roleEstimation().recommended()).containsExactly("Senior Backend Engineer");
        assertThat(report.redFlags()).containsExactly("Limited testing evidence");
    }

    @Test
    void truncatesReadmeTo10KiBBeforeRendering() {
        respondInOrder(completion(VALID_REPOSITORY_OUTPUT));

        client.analyzeRepository(new RepositoryAnalysisInput("test-repo", null, null, null, null,
                "가".repeat(4000) + "끝", null));

        wireMock.verify(postRequestedFor(urlEqualTo(COMPLETIONS))
                .withRequestBody(matchingJsonPath("$.messages[0].content", containing("가".repeat(3413) + "\n\n"))));
    }

    @Nested
    class InvalidResponses {

        @Test
        void retriesMalformedJsonAndSucceeds() {
            respondInOrder(completion("not json {"), completion(VALID_REPOSITORY_OUTPUT));

            assertThat(client.analyzeRepository(REPOSITORY_INPUT).summary()).isEqualTo("Test summary");
            assertThat(sleeps).containsExactly(1000L);
        }

        @Test
        void retriesEmptyResponses() {
            respondInOrder(completion(null), completion(""), completion(VALID_REPOSITORY_OUTPUT));

            assertThat(client.analyzeRepository(REPOSITORY_INPUT).summary()).isEqualTo("Test summary");
            assertThat(sleeps).containsExactly(1000L, 2000L);
        }

        @Test
        void throwsAfterTwoRetriesOnSchemaMismatch() {
            String invalid = "{\"repositoryName\":\"test-repo\"}";
            respondInOrder(completion(invalid));

            assertThatThrownBy(() -> client.analyzeRepository(REPOSITORY_INPUT))
                    .isInstanceOfSatisfying(LlmApiException.class, error -> {
                        assertThat(error.getMessage()).isEqualTo("Schema validation failed");
                        assertThat(error.getStatusCode()).isEqualTo(422);
                        assertThat(error.getRawResponse()).isEqualTo(invalid);
                    });
            wireMock.verify(3, postRequestedFor(urlEqualTo(COMPLETIONS)));
            assertThat(sleeps).containsExactly(1000L, 2000L);
        }

        // zod가 거부하는 값은 Java에서도 거부한다. Jackson 기본값이라면 앞의 세 개는 바꿔서 받아들인다.
        @ParameterizedTest
        @ValueSource(strings = {
                "\"confidence\":\"0.5\"",
                "\"summary\":123",
                "\"projectType\":true",
                "\"confidence\":1.5",
                "\"confidence\":-0.1",
                "\"estimatedRoles\":\"Backend\"",
                "\"techStack\":[\"Go\",null]",
                "\"summary\":null",
        })
        void rejectsValuesZodRejects(String override) {
            String key = override.substring(0, override.indexOf(':'));
            String invalid = VALID_REPOSITORY_OUTPUT.replaceFirst(key + ":[^,}]+(\\])?", override);
            respondInOrder(completion(invalid));

            assertThatThrownBy(() -> client.analyzeRepository(REPOSITORY_INPUT))
                    .isInstanceOf(LlmApiException.class)
                    .hasMessage("Schema validation failed");
        }

        @Test
        void rejectsNonObjectJson() {
            respondInOrder(completion("[]"));

            assertThatThrownBy(() -> client.analyzeRepository(REPOSITORY_INPUT)).hasMessage("Schema validation failed");
        }

        @Test
        void rejectsTrailingContentAsMalformed() {
            respondInOrder(completion(VALID_REPOSITORY_OUTPUT + " trailing"));

            assertThatThrownBy(() -> client.analyzeRepository(REPOSITORY_INPUT)).hasMessage("Malformed JSON from LLM");
        }

        @Test
        void acceptsCodeFenceUnknownFieldsAndIntegerConfidence() {
            String output = "```json\n" + VALID_REPOSITORY_OUTPUT.replace("0.8", "1").replace("}", ",\"extra\":1}")
                    + "\n```";
            respondInOrder(completion(output));

            RepositoryAnalysisResponse result = client.analyzeRepository(REPOSITORY_INPUT);

            assertThat(result.confidence()).isEqualTo(1.0);
            assertThat(sleeps).isEmpty();
        }

        @Test
        void rejectsProfileWithoutRoleEstimationFields() {
            respondInOrder(completion(VALID_PROFILE_OUTPUT.replace("\"recommended\":[\"Senior Backend Engineer\"]",
                    "\"recommended\":null")));

            assertThatThrownBy(() -> client.aggregateProfile(new ProfileAggregationInput("u", List.of())))
                    .hasMessage("Schema validation failed");
        }
    }

    @Nested
    class SdkErrors {

        @Test
        void wrapsHttpErrorAndKeepsStatusWithoutRetrying() {
            wireMock.stubFor(post(urlEqualTo(COMPLETIONS)).willReturn(aResponse().withStatus(401)
                    .withHeader("Content-Type", "application/json")
                    .withBody("{\"error\":{\"message\":\"bad key\",\"type\":\"invalid_request_error\"}}")));

            assertThatThrownBy(() -> client.analyzeRepository(REPOSITORY_INPUT))
                    .isInstanceOfSatisfying(LlmApiException.class, error -> {
                        assertThat(error.getStatusCode()).isEqualTo(401);
                        assertThat(error.getMessage()).startsWith("LLM API error: ");
                    });
            wireMock.verify(1, postRequestedFor(urlEqualTo(COMPLETIONS)));
        }

        @Test
        void mapsTimeoutTo408() {
            wireMock.stubFor(post(urlEqualTo(COMPLETIONS))
                    .willReturn(completion(VALID_REPOSITORY_OUTPUT).withFixedDelay(2000)));

            assertThatThrownBy(() -> client.analyzeRepository(REPOSITORY_INPUT))
                    .isInstanceOfSatisfying(LlmApiException.class, error -> {
                        assertThat(error.getStatusCode()).isEqualTo(408);
                        assertThat(error.getMessage()).isEqualTo("LLM request timed out");
                    });
        }

        @Test
        void mapsConnectionErrorTo503() {
            OpenAIClient unreachable = OpenAIOkHttpClient.builder()
                    .baseUrl("http://127.0.0.1:1/v1").apiKey("k").maxRetries(0).timeout(Duration.ofSeconds(2)).build();
            try {
                assertThatThrownBy(() -> newClient(unreachable).analyzeRepository(REPOSITORY_INPUT))
                        .isInstanceOfSatisfying(LlmApiException.class, error -> {
                            assertThat(error.getStatusCode()).isEqualTo(503);
                            assertThat(error.getMessage()).isEqualTo("LLM connection failed");
                        });
            } finally {
                unreachable.close();
            }
        }
    }

    @Nested
    class Logging {

        @Test
        void logsEachCallWithKindModelFinishReasonAndTokenUsage() {
            respondInOrder(completion(VALID_REPOSITORY_OUTPUT));

            try (LogCapture logs = LogCapture.of(LlmClient.class)) {
                client.analyzeRepository(REPOSITORY_INPUT);

                assertThat(logs.events("llm.call")).singleElement().satisfies(fields -> {
                    assertThat(fields)
                            .containsEntry("level", "INFO")
                            .containsEntry("kind", "repository")
                            .containsEntry("model", "test-model")
                            .containsEntry("finishReason", "stop")
                            .containsEntry("promptTokens", 120L)
                            .containsEntry("completionTokens", 30L)
                            .containsEntry("totalTokens", 150L)
                            .containsKey("durationMs")
                            .doesNotContainKeys("prompt", "content");
                });
            }
        }

        @Test
        void labelsProfileCalls() {
            respondInOrder(completion(VALID_PROFILE_OUTPUT));

            try (LogCapture logs = LogCapture.of(LlmClient.class)) {
                client.aggregateProfile(new ProfileAggregationInput("u", List.of()));

                assertThat(logs.events("llm.call")).singleElement()
                        .satisfies(fields -> assertThat(fields).containsEntry("kind", "profile"));
            }
        }

        @Test
        void logsInvalidResponseLengthButNotContent() {
            String secret = "{\"summary\":\"사용자 분석 전문\"}";
            respondInOrder(completion(secret), completion(VALID_REPOSITORY_OUTPUT));

            try (LogCapture logs = LogCapture.of(LlmClient.class)) {
                client.analyzeRepository(REPOSITORY_INPUT);

                assertThat(logs.events("llm.invalid_response")).singleElement().satisfies(fields -> {
                    assertThat(fields)
                            .containsEntry("level", "WARN")
                            .containsEntry("kind", "repository")
                            .containsEntry("attempt", 1)
                            .containsEntry("reason", "Schema validation failed")
                            .containsEntry("rawResponseLength", secret.length())
                            .containsEntry("finishReason", "stop");
                    assertThat(fields.values()).noneMatch(value -> String.valueOf(value).contains("사용자 분석 전문"));
                });
            }
        }

        @Test
        void keepsOnlyRawResponseLengthInLogFields() {
            assertThat(new LlmApiException("Schema validation failed", 422, "전문").logFields())
                    .containsEntry("statusCode", 422)
                    .containsEntry("rawResponseLength", 2)
                    .doesNotContainKey("rawResponse");
        }
    }
}
