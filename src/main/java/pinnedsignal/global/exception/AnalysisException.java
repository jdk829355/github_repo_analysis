package pinnedsignal.global.exception;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import lombok.Getter;
import pinnedsignal.global.logging.LoggableException;

@Getter
public class AnalysisException extends RuntimeException implements LoggableException {

    public enum Phase {
        FETCH, PARSE, AGGREGATE, GENERATE
    }

    private final Phase phase;
    private final String repository;

    public AnalysisException(String message, Phase phase) {
        this(message, phase, null);
    }

    public AnalysisException(String message, Phase phase, String repository) {
        super(message);
        this.phase = phase;
        this.repository = repository;
    }

    @Override
    public Map<String, Object> logFields() {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("phase", phase.name().toLowerCase(Locale.ROOT));
        if (repository != null) {
            fields.put("repository", repository);
        }
        return fields;
    }
}
