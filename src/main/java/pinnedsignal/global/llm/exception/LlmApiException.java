package pinnedsignal.global.llm.exception;

import java.util.LinkedHashMap;
import java.util.Map;
import lombok.Getter;
import pinnedsignal.global.logging.LoggableException;

@Getter
public class LlmApiException extends RuntimeException implements LoggableException {

    private final int statusCode;
    private final String rawResponse;

    public LlmApiException(String message, int statusCode) {
        this(message, statusCode, null);
    }

    public LlmApiException(String message, int statusCode, String rawResponse) {
        super(message);
        this.statusCode = statusCode;
        this.rawResponse = rawResponse;
    }

    // rawResponse는 사용자 분석 결과 전문이라 길이만 남긴다.
    @Override
    public Map<String, Object> logFields() {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("statusCode", statusCode);
        if (rawResponse != null) {
            fields.put("rawResponseLength", rawResponse.length());
        }
        return fields;
    }
}
