package pinnedsignal.global.github.exception;

import java.util.Map;
import lombok.Getter;
import pinnedsignal.global.logging.LoggableException;

@Getter
public class GitHubApiException extends RuntimeException implements LoggableException {

    private final int statusCode;
    private final String endpoint;

    public GitHubApiException(String message, int statusCode, String endpoint) {
        super(message);
        this.statusCode = statusCode;
        this.endpoint = endpoint;
    }

    @Override
    public Map<String, Object> logFields() {
        return Map.of("statusCode", statusCode, "endpoint", endpoint);
    }
}
