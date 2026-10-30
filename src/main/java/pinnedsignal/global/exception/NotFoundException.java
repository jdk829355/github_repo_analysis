package pinnedsignal.global.exception;

// 없는 작업이나 리포트를 조회했을 때 던진다. GlobalExceptionHandler가 404 화면으로 바꾼다.
public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }
}
