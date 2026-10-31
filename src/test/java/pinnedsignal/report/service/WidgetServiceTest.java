package pinnedsignal.report.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import pinnedsignal.analysis.entity.AnalysisJob;
import pinnedsignal.analysis.enums.RepoStatus;
import pinnedsignal.analysis.repository.AnalysisJobRepository;
import pinnedsignal.analysis.repository.RepoRepository;
import pinnedsignal.report.entity.ProfileReport;
import pinnedsignal.report.repository.ProfileReportRepository;
import pinnedsignal.report.service.WidgetSvgRenderer.Theme;
import pinnedsignal.support.AnalysisFixtures;
import pinnedsignal.support.IntegrationTestBase;

class WidgetServiceTest extends IntegrationTestBase {

    private static final String CURRENT_LIGHT = "<svg data-widget-version=\"inner-card-v4\">light</svg>";
    private static final String CURRENT_DARK = "<svg data-widget-version=\"inner-card-v4\">dark</svg>";

    @Autowired
    private WidgetService widgetService;
    @Autowired
    private AnalysisJobRepository jobRepository;
    @Autowired
    private RepoRepository repoRepository;
    @Autowired
    private ProfileReportRepository reportRepository;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    private ProfileReport reload(AnalysisJob job) {
        return reportRepository.findByAnalysisJobId(job.getId()).orElseThrow();
    }

    @Test
    void returnsTheStoredSvgForTheRequestedTheme() {
        AnalysisJob job = AnalysisFixtures.completedJob(jobRepository, "octocat");
        AnalysisFixtures.report(reportRepository, job, CURRENT_LIGHT, CURRENT_DARK);

        assertThat(widgetService.findSvg(job.getId(), Theme.LIGHT)).contains(CURRENT_LIGHT);
        assertThat(widgetService.findSvg(job.getId(), Theme.DARK)).contains(CURRENT_DARK);
    }

    @Test
    void usernameLookupServesTheLatestCompletedJobIgnoringCase() {
        AnalysisJob older = AnalysisFixtures.completedJob(jobRepository, "octocat");
        AnalysisFixtures.report(reportRepository, older, "<svg data-widget-version=\"inner-card-v4\">old</svg>",
                CURRENT_DARK);
        jdbcTemplate.update("UPDATE analysis_jobs SET created_at = created_at - interval '1 day' WHERE id = ?",
                older.getId());
        AnalysisJob latest = AnalysisFixtures.completedJob(jobRepository, "octocat");
        AnalysisFixtures.report(reportRepository, latest, CURRENT_LIGHT, CURRENT_DARK);
        AnalysisFixtures.failedJob(jobRepository, "octocat", "실패");

        assertThat(widgetService.findSvgByUsername("OctoCat", Theme.LIGHT)).contains(CURRENT_LIGHT);
        assertThat(widgetService.findSvgByUsername("nobody", Theme.LIGHT)).isEmpty();
    }

    @Test
    void rendersAndStoresBothThemesWhenNothingIsStored() {
        AnalysisJob job = AnalysisFixtures.completedJob(jobRepository, "octocat");
        AnalysisFixtures.repo(repoRepository, job, "a", "Java", 1, 0, RepoStatus.COMPLETED, "요약");
        AnalysisFixtures.repo(repoRepository, job, "b", "Go", 1, 1, RepoStatus.SKIPPED, null);
        AnalysisFixtures.report(reportRepository, job, null, null);

        Optional<String> dark = widgetService.findSvg(job.getId(), Theme.DARK);

        assertThat(dark).hasValueSatisfying(svg -> assertThat(svg)
                .contains("data-widget-version=\"inner-card-v4\"")
                .contains("@ octocat")
                .contains("2 pinned repos")
                .contains("#0D1117"));
        ProfileReport stored = reload(job);
        assertThat(stored.getWidgetSvgDark()).isEqualTo(dark.get());
        assertThat(stored.getWidgetSvgLight()).contains("#FFFFFF").contains("data-widget-version=\"inner-card-v4\"");
        assertThat(stored.getWidgetSvgUpdatedAt()).isNotNull();
    }

    @Test
    void rendersAgainWhenTheStoredSvgIsAnOlderVersion() {
        AnalysisJob job = AnalysisFixtures.completedJob(jobRepository, "octocat");
        AnalysisFixtures.report(reportRepository, job, "<svg data-widget-version=\"inner-card-v3\"/>",
                "<svg data-widget-version=\"inner-card-v3\"/>");

        Optional<String> light = widgetService.findSvg(job.getId(), Theme.LIGHT);

        assertThat(light).hasValueSatisfying(svg -> assertThat(svg).contains("inner-card-v4"));
        assertThat(reload(job).getWidgetSvgDark()).contains("inner-card-v4");
    }

    @Test
    void jobsWithoutAUsableReportHaveNoWidget() {
        AnalysisJob failed = AnalysisFixtures.failedJob(jobRepository, "failed", "실패");
        AnalysisFixtures.report(reportRepository, failed, CURRENT_LIGHT, CURRENT_DARK);
        AnalysisJob noReport = AnalysisFixtures.completedJob(jobRepository, "noreport");

        assertThat(widgetService.findSvg(failed.getId(), Theme.LIGHT)).isEmpty();
        assertThat(widgetService.findSvg(noReport.getId(), Theme.LIGHT)).isEmpty();
        assertThat(widgetService.findSvg("missing", Theme.LIGHT)).isEmpty();
    }
}
