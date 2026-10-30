package pinnedsignal.analysis.dto.response;

import java.util.List;
import pinnedsignal.analysis.enums.AnalysisJobStatus;
import pinnedsignal.analysis.enums.RepoStatus;

/**
 * 진행 화면이 그리는 작업 상태. 화면은 이 값만 보고 그리므로 새로고침해도 같은 내용이 나온다.
 *
 * @param finishedRepos 분석이 끝난 저장소 수. 건너뜀과 실패도 끝난 것으로 센다.
 */
public record AnalysisProgressResponse(
        String jobId,
        String githubProfile,
        AnalysisJobStatus status,
        String errorMessage,
        int totalRepos,
        int finishedRepos,
        List<RepoProgress> repos) {

    private static final String DEFAULT_FAILURE_MESSAGE = "분석에 실패했습니다";

    public record RepoProgress(String name, RepoStatus status, String summary, String errorMessage) {
    }

    public boolean pending() {
        return status == AnalysisJobStatus.PENDING;
    }

    public boolean completed() {
        return status == AnalysisJobStatus.COMPLETED;
    }

    public boolean failed() {
        return status == AnalysisJobStatus.FAILED;
    }

    // 작업이 시작됐지만 pinned 저장소 목록을 아직 받지 못했다.
    public boolean loadingRepos() {
        return status == AnalysisJobStatus.PROCESSING && totalRepos == 0;
    }

    // 저장소 분석이 모두 끝나고 프로필 종합만 남았다.
    public boolean aggregating() {
        return status == AnalysisJobStatus.PROCESSING && totalRepos > 0 && finishedRepos == totalRepos;
    }

    public int percent() {
        return totalRepos == 0 ? 0 : finishedRepos * 100 / totalRepos;
    }

    public String failureMessage() {
        return errorMessage != null && !errorMessage.isBlank() ? errorMessage : DEFAULT_FAILURE_MESSAGE;
    }
}
