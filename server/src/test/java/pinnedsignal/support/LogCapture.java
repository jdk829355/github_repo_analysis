package pinnedsignal.support;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.LoggerFactory;
import org.slf4j.event.KeyValuePair;

// 한 클래스의 로그를 모아 addKeyValue로 넘긴 필드를 Map으로 돌려준다.
public final class LogCapture implements AutoCloseable {

    private final Logger logger;
    private final ListAppender<ILoggingEvent> appender = new ListAppender<>();

    private LogCapture(Class<?> type) {
        this.logger = (Logger) LoggerFactory.getLogger(type);
        appender.start();
        logger.addAppender(appender);
    }

    public static LogCapture of(Class<?> type) {
        return new LogCapture(type);
    }

    public List<Map<String, Object>> events(String eventName) {
        return appender.list.stream()
                .map(LogCapture::fields)
                .filter(fields -> eventName.equals(fields.get("event")))
                .toList();
    }

    private static Map<String, Object> fields(ILoggingEvent event) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("level", event.getLevel().toString());
        if (event.getKeyValuePairs() != null) {
            for (KeyValuePair pair : event.getKeyValuePairs()) {
                fields.put(pair.key, pair.value);
            }
        }
        return fields;
    }

    @Override
    public void close() {
        logger.detachAppender(appender);
    }
}
