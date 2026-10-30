package pinnedsignal.global.util;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.regex.Pattern;

public final class TextUtils {

    // JS 정규식 \s와 같은 범위의 문자 클래스. Java의 \s는 유니코드 공백을 포함하지 않는다.
    public static final String JS_WHITESPACE = "[\\s\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]";

    private static final Pattern JS_WHITESPACE_RUN = Pattern.compile(JS_WHITESPACE + "+");
    private static final Pattern JS_EDGE_WHITESPACE = Pattern.compile("^" + JS_WHITESPACE + "+|" + JS_WHITESPACE + "+\\z");

    private TextUtils() {
    }

    // JS의 value.replace(/\s+/g, ' ').trim()과 같다.
    public static String collapseWhitespace(String value) {
        String collapsed = JS_WHITESPACE_RUN.matcher(value).replaceAll(" ");
        return JS_EDGE_WHITESPACE.matcher(collapsed).replaceAll("");
    }

    // JS의 value.split(/\s+/).filter(Boolean)과 같다.
    public static List<String> splitWords(String value) {
        return JS_WHITESPACE_RUN.splitAsStream(value).filter(word -> !word.isEmpty()).toList();
    }

    // UTF-8 바이트 수 기준으로 자른다. 문자(코드 포인트) 중간에서는 자르지 않는다.
    public static String truncateToMaxSize(String text, int maxBytes) {
        if (maxBytes <= 0) {
            return "";
        }
        if (text.getBytes(StandardCharsets.UTF_8).length <= maxBytes) {
            return text;
        }

        StringBuilder result = new StringBuilder();
        int currentBytes = 0;
        for (int i = 0; i < text.length(); ) {
            int codePoint = text.codePointAt(i);
            int charBytes = new String(Character.toChars(codePoint)).getBytes(StandardCharsets.UTF_8).length;
            if (currentBytes + charBytes > maxBytes) {
                break;
            }
            result.appendCodePoint(codePoint);
            currentBytes += charBytes;
            i += Character.charCount(codePoint);
        }
        return result.toString();
    }
}
