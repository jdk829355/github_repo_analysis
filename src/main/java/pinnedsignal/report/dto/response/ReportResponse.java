package pinnedsignal.report.dto.response;

import java.util.List;
import pinnedsignal.report.entity.RoleEstimation;

// 리포트 화면이 그리는 값. 배열 칼럼이 null이어도 화면에서는 빈 목록으로 다룬다.
// username은 README 위젯 주소를 사용자 기준으로 만들 때 쓴다.
public record ReportResponse(
        String overallSummary,
        RoleEstimation roleEstimation,
        List<String> engineeringStrengths,
        List<String> collaborationPatterns,
        List<String> greenFlags,
        List<String> redFlags,
        List<RepoCard> repositories,
        String username) {

    /** @param description 분석 요약. 없으면 빈 문자열이다. */
    public record RepoCard(String name, String description, String language, int stars) {
    }
}
