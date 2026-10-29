package pinnedsignal.global.util;

import java.nio.charset.StandardCharsets;

public final class TextUtils {

    private TextUtils() {
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
