package pinnedsignal.global.logging;

import java.util.Map;

// 로그의 err 객체에 함께 남길 필드. pino가 커스텀 에러의 필드(statusCode, endpoint 등)를 남기던 것과 같다.
public interface LoggableException {

    Map<String, Object> logFields();
}
