package pinnedsignal.global.logging;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.LoggingEvent;
import ch.qos.logback.classic.util.LogbackMDCAdapter;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.event.KeyValuePair;
import org.springframework.boot.logging.logback.StructuredLogEncoder;
import org.springframework.core.env.Environment;
import org.springframework.mock.env.MockEnvironment;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// application.yml과 같은 설정(logstash 형식 + LogMembersCustomizer)으로 실제 로그 한 줄이 어떻게 나오는지 본다.
class LogMembersCustomizerTest {

    private final LoggerContext context = new LoggerContext();
    private final JsonMapper json = JsonMapper.builder().build();
    private final StructuredLogEncoder encoder = new StructuredLogEncoder();

    @BeforeEach
    void startEncoder() {
        context.setMDCAdapter(new LogbackMDCAdapter());
        MockEnvironment environment = new MockEnvironment()
                .withProperty("logging.structured.json.customizer", LogMembersCustomizer.class.getName());
        context.putObject(Environment.class.getName(), environment);
        encoder.setContext(context);
        encoder.setFormat("logstash");
        encoder.start();
    }

    private LoggingEvent event(Level level, String message, Throwable error) {
        return new LoggingEvent(getClass().getName(), context.getLogger("test"), level, message, error, null);
    }

    private JsonNode format(LoggingEvent event) {
        String line = new String(encoder.encode(event), StandardCharsets.UTF_8);
        assertThat(line).endsWith("\n");
        assertThat(line.strip()).doesNotContain("\n");
        return json.readTree(line);
    }

    @Test
    void writesOneJsonLineWithEventFieldsAndMessage() {
        LoggingEvent event = event(Level.INFO, "analysis job started", null);
        event.addKeyValuePair(new KeyValuePair("event", "job.started"));
        event.addKeyValuePair(new KeyValuePair("jobId", "job-1"));

        JsonNode line = format(event);

        assertThat(line.get("level").asString()).isEqualTo("INFO");
        assertThat(line.get("@timestamp").asString()).startsWith("20");
        assertThat(line.get("event").asString()).isEqualTo("job.started");
        assertThat(line.get("jobId").asString()).isEqualTo("job-1");
        assertThat(line.get("message").asString()).isEqualTo("analysis job started");
    }

    @Test
    void redactsSecretLookingFieldsAndPrompts() {
        LoggingEvent event = event(Level.INFO, "request", null);
        event.addKeyValuePair(new KeyValuePair("token", "ghp_secret"));
        event.addKeyValuePair(new KeyValuePair("prompt", "README 전문"));
        event.addKeyValuePair(new KeyValuePair("headers", Map.of("authorization", "Bearer x", "accept", "json")));

        JsonNode line = format(event);

        assertThat(line.get("token").asString()).isEqualTo("[REDACTED]");
        assertThat(line.get("prompt").asString()).isEqualTo("[REDACTED]");
        assertThat(line.get("headers").get("authorization").asString()).isEqualTo("[REDACTED]");
        assertThat(line.get("headers").get("accept").asString()).isEqualTo("json");
    }

    @Test
    void writesListValues() {
        LoggingEvent event = event(Level.INFO, "repos", null);
        event.addKeyValuePair(new KeyValuePair("repos", List.of("a", "b")));

        JsonNode line = format(event);

        assertThat(line.get("repos").get(0).asString()).isEqualTo("a");
        assertThat(line.get("repos").get(1).asString()).isEqualTo("b");
    }

    @Test
    void scrubsSecretsFromMessagesAndStacks() {
        String token = "ghp_" + "A".repeat(36);
        JsonNode line = format(event(Level.ERROR, "failed with " + token, new IllegalStateException("bad token " + token)));

        assertThat(line.get("message").asString()).isEqualTo("failed with [REDACTED]");
        assertThat(line.get("stack_trace").asString()).contains("IllegalStateException", "[REDACTED]")
                .doesNotContain(token);
    }

    @Test
    void keepsFieldsOfLoggableExceptionsUnderErr() {
        class CustomException extends RuntimeException implements LoggableException {
            CustomException() {
                super("Profile not found");
            }

            @Override
            public Map<String, Object> logFields() {
                return Map.of("statusCode", 404, "endpoint", "/users/x");
            }
        }

        JsonNode err = format(event(Level.WARN, "failed", new CustomException())).get("err");

        assertThat(err.get("statusCode").asInt()).isEqualTo(404);
        assertThat(err.get("endpoint").asString()).isEqualTo("/users/x");
    }

    @Test
    void leavesOutErrForOrdinaryExceptions() {
        JsonNode line = format(event(Level.ERROR, "failed", new IllegalStateException("x")));

        assertThat(line.has("err")).isFalse();
        assertThat(line.has("stack_trace")).isTrue();
    }
}
