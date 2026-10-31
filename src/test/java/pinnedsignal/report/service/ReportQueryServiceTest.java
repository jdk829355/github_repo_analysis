package pinnedsignal.report.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import pinnedsignal.analysis.entity.AnalysisJob;
import pinnedsignal.analysis.enums.RepoStatus;
import pinnedsignal.analysis.repository.AnalysisJobRepository;
import pinnedsignal.analysis.repository.RepoRepository;
import pinnedsignal.global.exception.NotFoundException;
import pinnedsignal.report.dto.response.ReportResponse;
import pinnedsignal.report.dto.response.ReportResponse.RepoCard;
import pinnedsignal.report.repository.ProfileReportRepository;
import pinnedsignal.support.AnalysisFixtures;
import pinnedsignal.support.IntegrationTestBase;

class ReportQueryServiceTest extends IntegrationTestBase {

    @Autowired
    private ReportQueryService reportQueryService;
    @Autowired
    private AnalysisJobRepository jobRepository;
    @Autowired
    private RepoRepository repoRepository;
    @Autowired
    private ProfileReportRepository reportRepository;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void returnsTheStoredReportWithCompletedRepositoriesOnly() {
        AnalysisJob job = AnalysisFixtures.completedJob(jobRepository, "octocat");
        AnalysisFixtures.repo(repoRepository, job, "alpha", "Java", 12, 0, RepoStatus.COMPLETED, "알파 요약");
        AnalysisFixtures.repo(repoRepository, job, "empty", "Go", 1, 1, RepoStatus.SKIPPED, null);
        AnalysisFixtures.repo(repoRepository, job, "beta", null, 0, 2, RepoStatus.COMPLETED, "베타 요약");
        AnalysisFixtures.report(reportRepository, job, null, null);

        ReportResponse report = reportQueryService.getReport(job.getId());

        assertThat(report.overallSummary()).isEqualTo("전체 요약");
        assertThat(report.username()).isEqualTo("octocat");
        assertThat(report.roleEstimation().primary()).isEqualTo("Backend");
        assertThat(report.roleEstimation().secondary()).containsExactly("DevOps");
        assertThat(report.roleEstimation().recommended()).containsExactly("SRE");
        assertThat(report.engineeringStrengths()).containsExactly("강점 1", "강점 2");
        assertThat(report.collaborationPatterns()).containsExactly("패턴 1");
        assertThat(report.greenFlags()).containsExactly("초록 신호");
        assertThat(report.redFlags()).containsExactly("빨강 신호");
        assertThat(report.repositories()).containsExactly(
                new RepoCard("alpha", "알파 요약", "Java", 12),
                new RepoCard("beta", "베타 요약", "", 0));
    }

    @Test
    void treatsNullArrayColumnsAsEmptyLists() {
        AnalysisJob job = AnalysisFixtures.completedJob(jobRepository, "octocat");
        AnalysisFixtures.report(reportRepository, job, null, null);
        jdbcTemplate.update("UPDATE profile_reports SET green_flags = NULL, red_flags = NULL, "
                + "engineering_strengths = NULL, collaboration_patterns = NULL");

        ReportResponse report = reportQueryService.getReport(job.getId());

        assertThat(report.greenFlags()).isEmpty();
        assertThat(report.redFlags()).isEmpty();
        assertThat(report.engineeringStrengths()).isEmpty();
        assertThat(report.collaborationPatterns()).isEmpty();
    }

    @Test
    void latestJobIdIgnoresFailedJobsAndUnknownUsersAreNotFound() {
        AnalysisJob completed = AnalysisFixtures.completedJob(jobRepository, "octocat");
        AnalysisFixtures.failedJob(jobRepository, "octocat", "실패");

        assertThat(reportQueryService.getLatestJobId("octocat")).isEqualTo(completed.getId());
        assertThatThrownBy(() -> reportQueryService.getLatestJobId("nobody")).isInstanceOf(NotFoundException.class);
    }

    @Test
    void unknownJobIsNotFound() {
        assertThatThrownBy(() -> reportQueryService.getReport("missing")).isInstanceOf(NotFoundException.class);
    }

    @Test
    void failedJobIsNotFoundEvenIfAReportIsStored() {
        AnalysisJob job = AnalysisFixtures.failedJob(jobRepository, "octocat", "실패");
        AnalysisFixtures.report(reportRepository, job, null, null);

        assertThatThrownBy(() -> reportQueryService.getReport(job.getId())).isInstanceOf(NotFoundException.class);
    }

    @Test
    void completedJobWithoutAReportIsNotFound() {
        AnalysisJob job = AnalysisFixtures.completedJob(jobRepository, "octocat");

        assertThatThrownBy(() -> reportQueryService.getReport(job.getId())).isInstanceOf(NotFoundException.class);
    }
}
