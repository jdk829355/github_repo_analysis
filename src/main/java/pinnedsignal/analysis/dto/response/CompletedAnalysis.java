package pinnedsignal.analysis.dto.response;

import java.util.List;
import pinnedsignal.analysis.enums.RepoStatus;

/**
 * 끝난(COMPLETED) 작업과 그 저장소들. report 도메인이 리포트와 위젯을 만들 때 쓴다.
 * 저장소는 pinned 목록 순서다.
 */
public record CompletedAnalysis(String jobId, String githubProfile, List<RepoSummary> repos) {

    /** @param summary 분석 요약. 분석이 끝나지 않은 저장소는 null이다. */
    public record RepoSummary(String name, String summary, String language, int stars, RepoStatus status) {
    }
}
