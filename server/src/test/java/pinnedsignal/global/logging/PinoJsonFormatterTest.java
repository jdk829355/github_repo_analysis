package pinnedsignal.global.logging;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.LoggingEvent;
import ch.qos.logback.classic.util.LogbackMDCAdapter;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.slf4j.event.KeyValuePair;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class PinoJsonFormatterTest {

    private final PinoJsonFormatter formatter = new PinoJsonFormatter();
    private final LoggerContext context = new LoggerContext();
    private final JsonMapper json = JsonMapper.builder().build();

    PinoJsonFormatterTest() {
        context.setMDCAdapter(new LogbackMDCAdapter());
    }

    private LoggingEvent event(Level level, String message, Throwable error) {
        return new LoggingEvent(getClass().getName(), context.getLogger("test"), level, message, error, null);
    }

    private JsonNode format(LoggingEvent event) {
        String line = formatter.format(event);
        assertThat(line).endsWith("\n").doesNotContain("\n" + "{");
        return json.readTree(line);
    }

    @Test
    void writesLevelLabelIsoTimeFieldsAndMessageWithoutPidOrHostname() {
        LoggingEvent event = event(Level.INFO, "analysis job started", null);
        event.addKeyValuePair(new KeyValuePair("event", "job.started"));
        event.addKeyValuePair(new KeyValuePair("jobId", "job-1"));

        JsonNode line = format(event);

        assertThat(line.get("level").asString()).isEqualTo("info");
        assertThat(line.get("time").asString()).matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z");
        assertThat(line.get("event").asString()).isEqualTo("job.started");
        assertThat(line.get("jobId").asString()).isEqualTo("job-1");
        assertThat(line.get("msg").asString()).isEqualTo("analysis job started");
        assertThat(line.has("pid")).isFalse();
        assertThat(line.has("hostname")).isFalse();
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
    void scrubsSecretsFromErrorMessagesAndStacks() {
        String token = "ghp_" + "A".repeat(36);
        JsonNode line = format(event(Level.ERROR, "failed", new IllegalStateException("bad token " + token)));

        JsonNode err = line.get("err");
        assertThat(err.get("type").asString()).isEqualTo("IllegalStateException");
        assertThat(err.get("message").asString()).isEqualTo("bad token [REDACTED]");
        assertThat(err.get("stack").asString()).contains("[REDACTED]").doesNotContain(token);
    }

    @Test
    void keepsFieldsOfLoggableExceptions() {
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
}
