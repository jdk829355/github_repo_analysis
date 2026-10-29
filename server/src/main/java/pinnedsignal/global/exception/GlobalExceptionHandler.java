package pinnedsignal.global.exception;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * 화면 요청의 오류를 error/404, error/5xx 템플릿으로 바꾼다. 내부 메시지는 화면에 보내지 않고 로그에만 남긴다.
 * 매핑되지 않은 주소(404)는 Spring Boot의 기본 오류 처리가 같은 error/404 템플릿으로 보낸다.
 */
@Slf4j
@ControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public String notFound() {
        return "error/404";
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public String unexpected(Exception e, HttpServletRequest request) throws Exception {
        // 400 같은 요청 오류는 Spring이 원래 상태 코드로 처리하도록 넘긴다.
        if (e instanceof ErrorResponse) {
            throw e;
        }
        log.atError()
                .addKeyValue("event", "api.error")
                .addKeyValue("route", request.getRequestURI())
                .addKeyValue("status", 500)
                .setCause(e)
                .log("API request failed");
        return "error/5xx";
    }
}
