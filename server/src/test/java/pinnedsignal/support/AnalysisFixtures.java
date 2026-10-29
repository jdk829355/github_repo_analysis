package pinnedsignal.support;

import java.time.Instant;
import java.util.List;
import pinnedsignal.analysis.entity.AnalysisJob;
import pinnedsignal.analysis.entity.Repo;
import pinnedsignal.analysis.enums.RepoStatus;
import pinnedsignal.analysis.repository.AnalysisJobRepository;
import pinnedsignal.analysis.repository.RepoRepository;
import pinnedsignal.report.entity.ProfileReport;
import pinnedsignal.report.entity.RoleEstimation;
import pinnedsignal.report.repository.ProfileReportRepository;

// 화면 쪽 테스트가 DB에 미리 깔아 두는 작업·저장소·리포트.
public final class AnalysisFixtures {

    private AnalysisFixtures() {
    }

    public static AnalysisJob completedJob(AnalysisJobRepository repository, String username) {
        AnalysisJob job = AnalysisJob.pending("https://github.com/" + username);
        job.markCompleted(Instant.now());
        return repository.save(job);
    }

    public static AnalysisJob failedJob(AnalysisJobRepository repository, String username, String message) {
        AnalysisJob job = AnalysisJob.pending("https://github.com/" + username);
        job.markFailed(message);
        return repository.save(job);
    }

    /** summary는 분석이 끝난 저장소(COMPLETED)에만 의미가 있다. */
    public static Repo repo(RepoRepository repository, AnalysisJob job, String name, String language, int stars,
            int position, RepoStatus status, String summary) {
        Repo repo = Repo.builder()
                .analysisJob(job)
                .name(name)
                .fullName(job.getGithubProfile().substring("https://github.com/".length()) + "/" + name)
                .primaryLanguage(language)
                .stars(stars)
                .updatedAt(Instant.parse("2026-01-02T03:04:05Z"))
                .status(status)
                .position(position)
                .build();
        if (status == RepoStatus.COMPLETED) {
            repo.markCompleted(summary);
        }
        return repository.save(repo);
    }

    public static ProfileReport report(ProfileReportRepository repository, AnalysisJob job, String svgLight,
            String svgDark) {
        return repository.save(ProfileReport.builder()
                .analysisJob(job)
                .overallSummary("전체 요약")
                .roleEstimation(new RoleEstimation("Backend", List.of("DevOps"), List.of("SRE")))
                .engineeringStrengths(List.of("강점 1", "강점 2"))
                .collaborationPatterns(List.of("패턴 1"))
                .greenFlags(List.of("초록 신호"))
                .redFlags(List.of("빨강 신호"))
                .widgetSvgLight(svgLight)
                .widgetSvgDark(svgDark)
                .widgetSvgUpdatedAt(svgLight != null ? Instant.now() : null)
                .build());
    }
}
