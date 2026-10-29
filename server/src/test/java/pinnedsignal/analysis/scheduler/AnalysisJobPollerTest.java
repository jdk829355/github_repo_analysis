package pinnedsignal.analysis.scheduler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import pinnedsignal.analysis.entity.AnalysisJob;
import pinnedsignal.analysis.enums.AnalysisJobStatus;
import pinnedsignal.analysis.repository.AnalysisJobRepository;
import pinnedsignal.global.github.dto.GitHubCommit;
import pinnedsignal.global.github.dto.GitHubRepository;
import pinnedsignal.global.github.dto.RepositoriesResult;
import pinnedsignal.global.llm.dto.ProfileReportResponse;
import pinnedsignal.global.llm.dto.RepositoryAnalysisResponse;
import pinnedsignal.support.IntegrationTestBase;

class AnalysisJobPollerTest extends IntegrationTestBase {

    @Autowired
    private AnalysisJobPoller poller;
    @Autowired
    private AnalysisJobRepository jobRepository;

    @BeforeEach
    void stubGitHubAndLlm() {
        when(gitHubClient.getUserPinnedRepositories(anyString())).thenReturn(new RepositoriesResult(List.of(
                new GitHubRepository("app", "octocat/app", null, "Java", 1, 0,
                        Instant.parse("2026-01-02T03:04:05Z"), false, false, 1024, "octocat")), 0));
        when(gitHubClient.getRepositoryReadme(anyString(), anyString())).thenReturn("# README");
        when(gitHubClient.getRepositoryCommits(anyString(), anyString(), anyString()))
                .thenReturn(List.of(new GitHubCommit("sha", "Implement login flow", "2026-01-01T00:00:00Z", "octocat")));
        when(llmClient.analyzeRepository(any())).thenReturn(new RepositoryAnalysisResponse(
                "app", "요약", "web-app", List.of("Backend"), List.of(), List.of(), List.of(), 0.8));
        when(llmClient.aggregateProfile(any())).thenReturn(new ProfileReportResponse("종합",
                new ProfileReportResponse.RoleEstimation("Backend", List.of(), List.of()),
                List.of(), List.of(), List.of("강점"), List.of("약점")));
    }

    private String pendingJob(String username) {
        return jobRepository.save(AnalysisJob.pending("https://github.com/" + username)).getId();
    }

    private long count(AnalysisJobStatus status) {
        return jobRepository.findAll().stream().filter(job -> job.getStatus() == status).count();
    }

    @Test
    void picksPendingJobAndRunsItToCompletion() {
        String id = pendingJob("octocat");

        poller.poll();

        await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                assertThat(jobRepository.findById(id).orElseThrow().getStatus()).isEqualTo(AnalysisJobStatus.COMPLETED));
    }

    @Test
    void doesNothingWhenQueueIsEmpty() {
        poller.poll();

        assertThat(jobRepository.findAll()).isEmpty();
    }

    @Test
    void runsAtMostThreeJobsAtOnceAndTakesTheRestWhenSlotsFree() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        doAnswer(invocation -> {
            release.await();
            return new RepositoryAnalysisResponse("app", "요약", "web-app", List.of("Backend"), List.of(), List.of(),
                    List.of(), 0.8);
        }).when(llmClient).analyzeRepository(any());
        for (int i = 1; i <= 4; i++) {
            pendingJob("user" + i);
        }

        poller.poll();

        assertThat(count(AnalysisJobStatus.PROCESSING)).isEqualTo(3);
        assertThat(count(AnalysisJobStatus.PENDING)).isEqualTo(1);

        // 슬롯이 모두 차 있는 동안에는 폴러가 작업을 더 집지 않는다.
        poller.poll();
        assertThat(count(AnalysisJobStatus.PENDING)).isEqualTo(1);

        release.countDown();
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            poller.poll();
            assertThat(count(AnalysisJobStatus.COMPLETED)).isEqualTo(4);
        });
    }
}
