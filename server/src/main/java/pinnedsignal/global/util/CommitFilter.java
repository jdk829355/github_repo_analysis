package pinnedsignal.global.util;

import java.util.List;
import java.util.Locale;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * lib/commit-filter.ts를 옮긴 것. 정규식이 JS와 똑같이 동작하도록 두 가지를 바꿨다.
 * JS의 {@code $}(m 플래그 없음)는 입력 끝에서만 맞으므로 {@code \z}로 쓴다. Java의 {@code $}는 끝 줄바꿈 앞에서도 맞는다.
 * JS의 {@code \s}는 유니코드 공백을 포함하므로 {@link #S}로 쓴다. {@code \b}는 Java 19부터 JS처럼 ASCII 기준이다.
 */
public final class CommitFilter {

    private static final String S = "[\\s\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]";

    private static Pattern regex(String pattern) {
        return Pattern.compile(pattern.replace("\\s", S), Pattern.CASE_INSENSITIVE);
    }

    private static final List<Pattern> REGEX_PATTERNS = List.of(
            regex("^merged?\\b"),
            regex("^typo\\b"),
            regex("^fix\\s+lint\\b"),
            regex("^lint\\b"),
            regex("^format(ting)?\\b"),
            regex("^prettier\\b"),
            regex("^eslint\\b"),
            regex("^style\\b"),
            regex("^docs?\\b"),
            regex("^readme\\b"),
            regex("^bump\\b"),
            regex("^chore\\b"),
            regex("^update\\s+dependency\\b"),
            regex("^dependabot\\b"),
            Pattern.compile("^[0-9]{4}[-/][0-9]{2}[-/][0-9]{2}"),
            Pattern.compile("^[0-9]{6,8}\\z"),
            regex("^wip\\z"),
            regex("^temp\\z"));

    private static final Pattern MERGE = regex("^merged?\\b");
    private static final Pattern ASCII_WORD = Pattern.compile("^[a-zA-Z]+\\z");
    private static final Pattern UPDATE_DEPENDENCY = regex("^update\\s+(.+)?dependenc(y|ies)");
    private static final Pattern BUMP_VERSION = regex("^bump\\s+.+(?:\\s+to\\s+|\\s+-\\s+)");
    private static final Pattern PACKAGE_VERSION = regex("^[a-z]+-\\d+\\.\\d+\\.\\d+");
    private static final Pattern DEPENDENCY_WORD = regex("\\b(lodash|react|npm|package|version)\\b");
    private static final Pattern ARCHIVE = regex("^archive\\b");
    private static final Pattern MEMO = regex("^memo\\b");
    private static final Pattern FORMATTING_ONLY = regex("^format(ting)?(\\s+only)?\\z");

    private CommitFilter() {
    }

    private static String lower(String message) {
        return message.toLowerCase(Locale.ROOT);
    }

    private static boolean matchesRegexPatterns(String message) {
        String lowerMessage = lower(message);
        return REGEX_PATTERNS.stream().anyMatch(pattern -> pattern.matcher(lowerMessage).find());
    }

    private static boolean isOneWordCommit(String message) {
        String trimmed = message.strip();
        if (trimmed.isEmpty() || trimmed.indexOf(' ') != -1) {
            return false;
        }
        return ASCII_WORD.matcher(trimmed).find() && trimmed.length() <= 6;
    }

    private static boolean isDependencyUpdate(String message) {
        String lowerMessage = lower(message);
        return UPDATE_DEPENDENCY.matcher(lowerMessage).find()
                || BUMP_VERSION.matcher(lowerMessage).find()
                || PACKAGE_VERSION.matcher(lowerMessage).find()
                || (lowerMessage.startsWith("update") && DEPENDENCY_WORD.matcher(message).find());
    }

    private static boolean isArchiveOrMemo(String message) {
        String lowerMessage = lower(message);
        return ARCHIVE.matcher(lowerMessage).find() || MEMO.matcher(lowerMessage).find();
    }

    private static boolean isFormattingOnly(String message) {
        return FORMATTING_ONLY.matcher(lower(message)).find();
    }

    public static boolean isMergeCommit(String message) {
        return MERGE.matcher(lower(message)).find();
    }

    public static boolean isMeaningfulCommit(String message) {
        if (message == null || message.strip().isEmpty()) {
            return false;
        }
        return !matchesRegexPatterns(message)
                && !isOneWordCommit(message)
                && !isDependencyUpdate(message)
                && !isArchiveOrMemo(message)
                && !isFormattingOnly(message);
    }

    public static <T> List<T> filterCommits(List<T> commits, Function<T, String> message) {
        return commits.stream()
                .filter(commit -> !isMergeCommit(message.apply(commit)) && isMeaningfulCommit(message.apply(commit)))
                .toList();
    }
}
