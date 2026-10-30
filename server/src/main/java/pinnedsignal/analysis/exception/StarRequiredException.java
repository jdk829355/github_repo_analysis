package pinnedsignal.analysis.exception;

import lombok.Getter;

// 검증용 저장소에 star가 없다. 화면에는 안내 문구와 "검증 후 분석" 버튼이 나간다.
@Getter
public class StarRequiredException extends RuntimeException {

    private final String username;

    public StarRequiredException(String username) {
        super("verification repository is not starred by " + username);
        this.username = username;
    }
}
