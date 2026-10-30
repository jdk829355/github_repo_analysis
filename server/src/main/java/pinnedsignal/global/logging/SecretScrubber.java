package pinnedsignal.global.logging;

import java.util.List;
import java.util.regex.Pattern;

// 외부 API 에러 메시지처럼 내용을 통제할 수 없는 문자열에서 비밀값 형태를 지운다. lib/logger.ts의 scrubSecrets와 같다.
public final class SecretScrubber {

    public static final String REDACTED = "[REDACTED]";

    private record Rule(Pattern pattern, String replacement) {
    }

    private static final List<Rule> RULES = List.of(
            new Rule(Pattern.compile("gh[pousr]_[A-Za-z0-9]{20,}"), REDACTED),
            new Rule(Pattern.compile("github_pat_[A-Za-z0-9_]{20,}"), REDACTED),
            new Rule(Pattern.compile("sk-[A-Za-z0-9_-]{20,}"), REDACTED),
            new Rule(Pattern.compile("(Bearer\\s+)[A-Za-z0-9._~+/=-]+", Pattern.CASE_INSENSITIVE), "$1" + REDACTED),
            new Rule(Pattern.compile("(\\b[a-z][a-z0-9+.-]*://[^:/\\s@]+:)[^@\\s]+@", Pattern.CASE_INSENSITIVE),
                    "$1" + REDACTED + "@"));

    private SecretScrubber() {
    }

    public static String scrub(String text) {
        if (text == null) {
            return null;
        }
        String result = text;
        for (Rule rule : RULES) {
            result = rule.pattern().matcher(result).replaceAll(rule.replacement());
        }
        return result;
    }
}
