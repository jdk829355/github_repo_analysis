package pinnedsignal.global.logging;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.classic.spi.ThrowableProxy;
import ch.qos.logback.classic.spi.ThrowableProxyUtil;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.slf4j.event.KeyValuePair;
import org.springframework.boot.logging.structured.StructuredLogFormatter;
import tools.jackson.databind.json.JsonMapper;

/**
 * Node 앱(pino)과 같은 모양의 JSON 한 줄을 쓴다. 수집기와 대시보드가 같은 필드 이름(level, time, event, msg)을 그대로 쓰게 하기 위해서다.
 * 필드는 SLF4J fluent API의 addKeyValue와 MDC로 넘긴다. 예외는 setCause로 넘기면 err에 들어간다.
 */
public class PinoJsonFormatter implements StructuredLogFormatter<ILoggingEvent> {

    // 객체로 넘긴 필드 중 비밀값이나 프롬프트처럼 남기면 안 되는 이름. 중첩된 Map 안에서도 가린다.
    private static final Set<String> REDACT_KEYS = Set.of("authorization", "apiKey", "token", "password", "prompt");

    private static final DateTimeFormatter TIME_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Override
    public String format(ILoggingEvent event) {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("level", event.getLevel().toString().toLowerCase(Locale.ROOT));
        line.put("time", TIME_FORMAT.format(Instant.ofEpochMilli(event.getTimeStamp())));
        event.getMDCPropertyMap().forEach((key, value) -> line.put(key, redact(key, value)));
        if (event.getKeyValuePairs() != null) {
            for (KeyValuePair pair : event.getKeyValuePairs()) {
                line.put(pair.key, redact(pair.key, pair.value));
            }
        }
        if (event.getThrowableProxy() != null) {
            line.put("err", serializeError(event.getThrowableProxy()));
        }
        line.put("msg", event.getFormattedMessage());
        return JSON.writeValueAsString(line) + "\n";
    }

    private static Object redact(String key, Object value) {
        if (REDACT_KEYS.contains(key)) {
            return SecretScrubber.REDACTED;
        }
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> copy = new LinkedHashMap<>();
            map.forEach((k, v) -> copy.put(String.valueOf(k), redact(String.valueOf(k), v)));
            return copy;
        }
        return value;
    }

    private static Map<String, Object> serializeError(IThrowableProxy proxy) {
        Map<String, Object> err = new LinkedHashMap<>();
        String className = proxy.getClassName();
        err.put("type", className.substring(className.lastIndexOf('.') + 1));
        err.put("message", SecretScrubber.scrub(proxy.getMessage()));
        err.put("stack", SecretScrubber.scrub(ThrowableProxyUtil.asString(proxy)));
        if (proxy instanceof ThrowableProxy real && real.getThrowable() instanceof LoggableException loggable) {
            loggable.logFields().forEach((key, value) -> err.put(key, redact(key, value)));
        }
        return err;
    }
}
