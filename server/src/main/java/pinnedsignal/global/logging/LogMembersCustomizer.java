package pinnedsignal.global.logging;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.ThrowableProxy;
import java.util.Map;
import java.util.Set;
import org.springframework.boot.json.JsonWriter.Members;
import org.springframework.boot.json.JsonWriter.ValueProcessor;
import org.springframework.boot.logging.structured.StructuredLoggingJsonMembersCustomizer;

/**
 * Spring Boot 내장 구조화 로그(logstash 형식)에 두 가지를 더한다. 하나는 LoggableException의 필드를 err 아래에 남기는 것이고,
 * 다른 하나는 비밀값 마스킹이다. 필드 이름으로 가리는 것과 문자열 안의 비밀값 형태를 지우는 것 두 겹이다.
 * application.yml의 logging.structured.json.customizer로 꽂는다.
 */
public class LogMembersCustomizer implements StructuredLoggingJsonMembersCustomizer<ILoggingEvent> {

    // 남기면 안 되는 필드 이름. 중첩된 Map 안에서도 가린다.
    private static final Set<String> REDACT_KEYS = Set.of("authorization", "apiKey", "token", "password", "prompt");

    @Override
    public void customize(Members<ILoggingEvent> members) {
        // 인자로 들어간 메서드가 이벤트를 받아서 새로운 멤버의 값을 채움 (null이 아닐 때만)
        members.add("err", LogMembersCustomizer::loggableFields).whenNotNull();
        // 이름으로 걸러서 대상 키의 데이터를 타입 상관 없이 마스킹
        // 배열 원소는 이름이 null이고 Set.of는 contains(null)에서 NPE를 던지므로 먼저 거른다.
        members.applyingValueProcessor(ValueProcessor.<Object>of(value -> SecretScrubber.REDACTED)
                .whenHasPath(path -> path.name() != null && REDACT_KEYS.contains(path.name())));
        // 정규식으로 걸러야하니까 value가 String인 필드에만 적용
        members.applyingValueProcessor(ValueProcessor.of(String.class, SecretScrubber::scrub));
    }

    private static Map<String, Object> loggableFields(ILoggingEvent event) {
        // 예외가 있으면서 그 예외가 LoggableException인 경우
        if (event.getThrowableProxy() instanceof ThrowableProxy proxy
                && proxy.getThrowable() instanceof LoggableException loggable) {
            return loggable.logFields(); // 결국 이게 err 필드에 들어가는 것
        }
        return null;
    }
}
