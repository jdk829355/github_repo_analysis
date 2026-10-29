package pinnedsignal.analysis.dto.request;

/**
 * POST /analyze 폼 값.
 *
 * @param url 사용자가 입력한 GitHub 프로필 URL
 * @param confirm star 안내를 보고 "검증 후 분석"을 눌러 다시 보낸 요청이면 true. 처음 요청에는 값이 없다.
 */
public record AnalyzeRequest(String url, Boolean confirm) {

    public boolean isConfirmation() {
        return Boolean.TRUE.equals(confirm);
    }
}
