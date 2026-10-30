package pinnedsignal.analysis.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import pinnedsignal.analysis.dto.response.AnalysisProgressResponse;
import pinnedsignal.analysis.dto.response.AnalysisProgressResponse.RepoProgress;
import pinnedsignal.analysis.dto.response.CompletedAnalysis;
import pinnedsignal.analysis.entity.AnalysisJob;
import pinnedsignal.analysis.enums.AnalysisJobStatus;
import pinnedsignal.analysis.enums.RepoStatus;
import pinnedsignal.analysis.repository.AnalysisJobRepository;
import pinnedsignal.analysis.repository.RepoRepository;
import pinnedsignal.global.exception.NotFoundException;
import pinnedsignal.support.AnalysisFixtures;
import pinnedsignal.support.IntegrationTestBase;

class AnalysisQueryServiceTest extends IntegrationTestBase {

    @Autowired
    private AnalysisQueryService queryService;
    @Autowired
    private AnalysisJobRepository jobRepository;
    @Autowired
    private RepoRepository repoRepository;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    private AnalysisJob processingJob(String username) {
        AnalysisJob job = jobRepository.save(AnalysisJob.pending("https://github.com/" + username));
        jdbcTemplate.update("UPDATE analysis_jobs SET status = 'PROCESSING' WHERE id = ?", job.getId());
        return job;
    }

    @Test
    void progressListsRepositoriesInPinnedOrderAndCountsFinishedOnes() {
        AnalysisJob job = processingJob("octocat");
        AnalysisFixtures.repo(repoRepository, job, "third", "Go", 0, 2, RepoStatus.PENDING, null);
        AnalysisFixtures.repo(repoRepository, job, "first", "Java", 5, 0, RepoStatus.COMPLETED, "첫 요약");
        AnalysisFixtures.repo(repoRepository, job, "second", "Java", 1, 1, RepoStatus.ANALYZING, null);
        AnalysisFixtures.repo(repoRepository, job, "fourth", null, 0, 3, RepoStatus.SKIPPED, null);

        AnalysisProgressResponse progress = queryService.getProgress(job.getId());

        assertThat(progress.status()).isEqualTo(AnalysisJobStatus.PROCESSING);
        assertThat(progress.githubProfile()).isEqualTo("https://github.com/octocat");
        assertThat(progress.repos()).extracting(RepoProgress::name)
                .containsExactly("first", "second", "third", "fourth");
        assertThat(progress.totalRepos()).isEqualTo(4);
        assertThat(progress.finishedRepos()).isEqualTo(2);
        assertThat(progress.percent()).isEqualTo(50);
        assertThat(progress.aggregating()).isFalse();
    }

    @Test
    void progressShowsSummaryOnlyForCompletedRepositories() {
        AnalysisJob job = processingJob("octocat");
        AnalysisFixtures.repo(repoRepository, job, "done", "Java", 0, 0, RepoStatus.COMPLETED, "분석 요약");
        AnalysisFixtures.repo(repoRepository, job, "running", "Java", 0, 1, RepoStatus.ANALYZING, null);

        AnalysisProgressResponse progress = queryService.getProgress(job.getId());

        assertThat(progress.repos()).extracting(RepoProgress::summary).containsExactly("분석 요약", null);
    }

    @Test
    void progressCarriesRepositoryFailureMessages() {
        AnalysisJob job = processingJob("octocat");
        var failed = AnalysisFixtures.repo(repoRepository, job, "broken", "Java", 0, 0, RepoStatus.PENDING, null);
        jdbcTemplate.update("UPDATE repositories SET status = 'FAILED', error_message = ? WHERE id = ?",
                "분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", failed.getId());

        AnalysisProgressResponse progress = queryService.getProgress(job.getId());

        assertThat(progress.repos()).singleElement().satisfies(repo -> {
            assertThat(repo.status()).isEqualTo(RepoStatus.FAILED);
            assertThat(repo.errorMessage()).isEqualTo("분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        });
        assertThat(progress.finishedRepos()).isEqualTo(1);
        assertThat(progress.aggregating()).isTrue();
    }

    @Test
    void progressOfAFailedJobCarriesItsMessage() {
        AnalysisJob job = AnalysisFixtures.failedJob(jobRepository, "octocat", "분석 시간이 초과되었습니다.");

        AnalysisProgressResponse progress = queryService.getProgress(job.getId());

        assertThat(progress.failed()).isTrue();
        assertThat(progress.failureMessage()).isEqualTo("분석 시간이 초과되었습니다.");
    }

    @Test
    void progressOfAnUnknownJobIsNotFound() {
        assertThatThrownBy(() -> queryService.getProgress("missing")).isInstanceOf(NotFoundException.class);
    }

    @Test
    void completedAnalysisIncludesEveryRepositoryInPinnedOrder() {
        AnalysisJob job = AnalysisFixtures.completedJob(jobRepository, "octocat");
        AnalysisFixtures.repo(repoRepository, job, "b", "Go", 3, 1, RepoStatus.SKIPPED, null);
        AnalysisFixtures.repo(repoRepository, job, "a", "Java", 7, 0, RepoStatus.COMPLETED, "요약 a");

        CompletedAnalysis analysis = queryService.findCompleted(job.getId()).orElseThrow();

        assertThat(analysis.githubProfile()).isEqualTo("https://github.com/octocat");
        assertThat(analysis.repos()).extracting(CompletedAnalysis.RepoSummary::name).containsExactly("a", "b");
        assertThat(analysis.repos().getFirst().summary()).isEqualTo("요약 a");
        assertThat(analysis.repos().getFirst().stars()).isEqualTo(7);
        assertThat(analysis.repos().getFirst().language()).isEqualTo("Java");
    }

    @Test
    void jobsThatAreNotCompletedAreNotFound() {
        AnalysisJob pending = jobRepository.save(AnalysisJob.pending("https://github.com/pending"));
        AnalysisJob failed = AnalysisFixtures.failedJob(jobRepository, "failed", "실패");

        assertThat(queryService.findCompleted(pending.getId())).isEmpty();
        assertThat(queryService.findCompleted(failed.getId())).isEmpty();
        assertThat(queryService.findCompleted("missing")).isEmpty();
    }
}
