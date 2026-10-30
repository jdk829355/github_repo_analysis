package pinnedsignal.analysis.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import pinnedsignal.analysis.entity.AnalysisJob;
import pinnedsignal.analysis.entity.Repo;
import pinnedsignal.analysis.enums.AnalysisJobStatus;
import pinnedsignal.analysis.enums.RepoStatus;
import pinnedsignal.analysis.repository.AnalysisJobRepository;
import pinnedsignal.analysis.repository.RepoAnalysisRepository;
import pinnedsignal.analysis.repository.RepoRepository;
import pinnedsignal.global.github.dto.GitHubCommit;
import pinnedsignal.global.github.dto.GitHubRepository;
import pinnedsignal.global.github.dto.RepositoriesResult;
import pinnedsignal.global.github.exception.GitHubApiException;
import pinnedsignal.global.llm.dto.ProfileAggregationInput;
import pinnedsignal.global.llm.dto.ProfileReportResponse;
import pinnedsignal.global.llm.dto.RepositoryAnalysisInput;
import pinnedsignal.global.llm.dto.RepositoryAnalysisResponse;
import pinnedsignal.global.llm.exception.LlmApiException;
import pinnedsignal.report.entity.ProfileReport;
import pinnedsignal.report.repository.ProfileReportRepository;
import pinnedsignal.support.IntegrationTestBase;
import pinnedsignal.support.LogCapture;

class AnalysisPipelineServiceTest extends IntegrationTestBase {

    private static final String PROFILE = "https://github.com/octocat";
    private static final Instant T0 = Instant.parse("2026-01-02T03:04:05Z");
    private static final String GENERIC_FAILURE = "분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";

    @Autowired
    private AnalysisPipelineService pipeline;
    @Autowired
    private AnalysisJobRepository jobRepository;
    @Autowired
    private RepoRepository repoRepository;
    @Autowired
    private RepoAnalysisRepository repoAnalysisRepository;
    @Autowired
    private ProfileReportRepository profileReportRepository;

    private List<GitHubRepository> pinned;

    private static GitHubRepository repo(String name, Instant updatedAt) {
        return new GitHubRepository(name, "octocat/" + name, "설명 " + name, "Java", 3, 1, updatedAt, false, false,
                1024, "octocat");
    }

    private static GitHubCommit commit(String message) {
        return new GitHubCommit("sha-" + message.hashCode(), message, "2026-01-01T00:00:00Z", "octocat");
    }

    private static RepositoryAnalysisResponse analysis(String name) {
        return new RepositoryAnalysisResponse(name, name + " 요약", "web-app", List.of("Backend"),
                List.of("API 구현"), List.of("Spring"), List.of(), 0.8);
    }

    private static ProfileReportResponse report(List<String> green, List<String> red) {
        return new ProfileReportResponse("종합 요약",
                new ProfileReportResponse.RoleEstimation("Backend", List.of("DevOps"), List.of("Platform")),
                List.of("API 설계"), List.of("코드 리뷰"), green, red);
    }

    @BeforeEach
    void stubDefaults() {
        pinned = List.of(repo("alpha", T0), repo("beta", T0));
        stubPinned();
        when(gitHubClient.getRepositoryReadme(anyString(), anyString())).thenReturn("# README");
        when(gitHubClient.getRepositoryCommits(anyString(), anyString(), anyString()))
                .thenReturn(List.of(commit("Implement login flow")));
        when(llmClient.analyzeRepository(any())).thenAnswer(invocation ->
                analysis(invocation.<RepositoryAnalysisInput>getArgument(0).repositoryName()));
        when(llmClient.aggregateProfile(any())).thenReturn(report(List.of("꾸준한 테스트"), List.of("프론트엔드 경험 부족")));
    }

    private void stubPinned() {
        when(gitHubClient.getUserPinnedRepositories("octocat")).thenReturn(new RepositoriesResult(pinned, 0));
    }

    private ClaimedJob newJob() {
        AnalysisJob job = jobRepository.save(AnalysisJob.pending(PROFILE));
        return new ClaimedJob(job.getId(), PROFILE);
    }

    private void run(ClaimedJob job) {
        pipeline.run(job, () -> false);
    }

    private AnalysisJob job(ClaimedJob claimed) {
        return jobRepository.findById(claimed.id()).orElseThrow();
    }

    private List<Repo> repos(ClaimedJob claimed) {
        return repoRepository.findByAnalysisJobIdOrderByPositionAsc(claimed.id());
    }

    private ClaimedJob runNewJob() {
        ClaimedJob job = newJob();
        run(job);
        return job;
    }

    @Test
    void analyzesPinnedRepositoriesInOrderAndSavesReport() {
        ClaimedJob job = newJob();

        try (LogCapture logs = LogCapture.of(AnalysisPipelineService.class)) {
            run(job);

            assertThat(logs.events("job.started")).singleElement().satisfies(fields ->
                    assertThat(fields).containsEntry("username", "octocat"));
            assertThat(logs.events("job.completed")).singleElement().satisfies(fields -> {
                assertThat(fields).containsEntry("profileReused", false);
                assertThat(fields.get("repos")).isEqualTo(
                        Map.of("total", 2, "reused", 0, "completed", 2, "skipped", 0, "failed", 0));
            });
        }

        assertThat(job(job).getStatus()).isEqualTo(AnalysisJobStatus.COMPLETED);
        assertThat(job(job).getCompletedAt()).isNotNull();
        assertThat(repos(job)).extracting(Repo::getName, Repo::getPosition, Repo::getStatus, Repo::getDescription)
                .containsExactly(
                        tuple("alpha", 0, RepoStatus.COMPLETED, "alpha 요약"),
                        tuple("beta", 1, RepoStatus.COMPLETED, "beta 요약"));
        assertThat(repoAnalysisRepository.findAll()).hasSize(2);
        ProfileReport saved = profileReportRepository.findByAnalysisJobId(job.id()).orElseThrow();
        assertThat(saved.getOverallSummary()).isEqualTo("종합 요약");
        assertThat(saved.getWidgetSvgLight()).contains("PINNED SIGNAL", "2 pinned repos");
        assertThat(saved.getWidgetSvgDark()).contains("PINNED SIGNAL");

        ArgumentCaptor<RepositoryAnalysisInput> inputs = ArgumentCaptor.forClass(RepositoryAnalysisInput.class);
        verify(llmClient, times(2)).analyzeRepository(inputs.capture());
        assertThat(inputs.getAllValues()).extracting(RepositoryAnalysisInput::repositoryName)
                .containsExactly("alpha", "beta");
        assertThat(inputs.getAllValues().getFirst().commitLogs())
                .containsExactly(new RepositoryAnalysisInput.CommitLog(
                        "Implement login flow", "2026-01-01T00:00:00Z", "octocat"));
    }

    @Test
    void failsWhenThereAreNoPinnedRepositories() {
        pinned = List.of();
        stubPinned();

        ClaimedJob job = runNewJob();

        assertThat(job(job).getStatus()).isEqualTo(AnalysisJobStatus.FAILED);
        assertThat(job(job).getErrorMessage()).isEqualTo("고정(pinned)된 저장소가 없어 분석할 수 없습니다.");
        assertThat(repos(job)).isEmpty();
    }

    @Test
    void continuesWhenOneRepositoryFails() {
        when(gitHubClient.getRepositoryCommits("octocat", "alpha", "octocat"))
                .thenThrow(new GitHubApiException("secret upstream detail", 500, "/repos/octocat/alpha/commits"));
        ClaimedJob job = newJob();

        try (LogCapture logs = LogCapture.of(RepoAnalysisService.class)) {
            run(job);

            assertThat(logs.events("repo.failed")).singleElement().satisfies(fields -> {
                assertThat(fields).containsEntry("level", "WARN").containsEntry("repo", "alpha");
            });
        }

        assertThat(job(job).getStatus()).isEqualTo(AnalysisJobStatus.COMPLETED);
        List<Repo> rows = repos(job);
        assertThat(rows.get(0).getStatus()).isEqualTo(RepoStatus.FAILED);
        // 사용자에게는 정해진 문구만 남기고 원본 메시지는 저장하지 않는다.
        assertThat(rows.get(0).getErrorMessage()).isEqualTo(GENERIC_FAILURE);
        assertThat(rows.get(1).getStatus()).isEqualTo(RepoStatus.COMPLETED);
        ArgumentCaptor<ProfileAggregationInput> input = ArgumentCaptor.forClass(ProfileAggregationInput.class);
        verify(llmClient).aggregateProfile(input.capture());
        assertThat(input.getValue().repositoryAnalyses()).extracting(RepositoryAnalysisResponse::repositoryName)
                .containsExactly("beta");
        assertThat(profileReportRepository.findByAnalysisJobId(job.id()).orElseThrow().getWidgetSvgLight())
                .contains("1 pinned repos");
    }

    @Test
    void skipsRepositoryWithoutMeaningfulCommits() {
        when(gitHubClient.getRepositoryCommits("octocat", "alpha", "octocat"))
                .thenReturn(List.of(commit("Merge pull request #1"), commit("wip")));

        ClaimedJob job = runNewJob();

        assertThat(job(job).getStatus()).isEqualTo(AnalysisJobStatus.COMPLETED);
        assertThat(repos(job)).extracting(Repo::getStatus).containsExactly(RepoStatus.SKIPPED, RepoStatus.COMPLETED);
        verify(llmClient, times(1)).analyzeRepository(any());
    }

    @Test
    void failsWithoutReportWhenNoRepositoryCompleted() {
        when(gitHubClient.getRepositoryCommits(anyString(), anyString(), anyString()))
                .thenReturn(List.of(commit("wip")));

        ClaimedJob job = runNewJob();

        assertThat(job(job).getStatus()).isEqualTo(AnalysisJobStatus.FAILED);
        assertThat(job(job).getErrorMessage()).isEqualTo("분석할 수 있는 저장소가 없습니다.");
        assertThat(repos(job)).extracting(Repo::getStatus).containsOnly(RepoStatus.SKIPPED);
        verify(llmClient, never()).aggregateProfile(any());
        assertThat(profileReportRepository.findAll()).isEmpty();
    }

    @Test
    void failsWithoutFallbackReportWhenAggregationFails() {
        when(llmClient.aggregateProfile(any())).thenThrow(new LlmApiException("raw upstream body", 502, "원본 응답"));

        ClaimedJob job = runNewJob();

        assertThat(job(job).getStatus()).isEqualTo(AnalysisJobStatus.FAILED);
        assertThat(job(job).getErrorMessage()).isEqualTo(GENERIC_FAILURE);
        assertThat(profileReportRepository.findAll()).isEmpty();
        assertThat(repos(job)).extracting(Repo::getStatus).containsOnly(RepoStatus.COMPLETED);
    }

    @Test
    void analyzesWithoutReadmeWhenItDoesNotExist() {
        when(gitHubClient.getRepositoryReadme(anyString(), anyString()))
                .thenThrow(new GitHubApiException("Not Found", 404, "/repos/octocat/alpha/readme"));

        ClaimedJob job = runNewJob();

        assertThat(job(job).getStatus()).isEqualTo(AnalysisJobStatus.COMPLETED);
        ArgumentCaptor<RepositoryAnalysisInput> inputs = ArgumentCaptor.forClass(RepositoryAnalysisInput.class);
        verify(llmClient, times(2)).analyzeRepository(inputs.capture());
        assertThat(inputs.getAllValues()).extracting(RepositoryAnalysisInput::readme).containsOnlyNulls();
    }

    @Test
    void failsRepositoryWhenReadmeErrorIsNotNotFound() {
        when(gitHubClient.getRepositoryReadme("octocat", "alpha"))
                .thenThrow(new GitHubApiException("Server Error", 500, "/repos/octocat/alpha/readme"));

        ClaimedJob job = runNewJob();

        assertThat(repos(job)).extracting(Repo::getStatus).containsExactly(RepoStatus.FAILED, RepoStatus.COMPLETED);
    }

    @Test
    void reusesPreviousAnalysesAndReportWhenNothingChanged() {
        ClaimedJob first = runNewJob();

        ClaimedJob second = newJob();
        try (LogCapture logs = LogCapture.of(AnalysisPipelineService.class)) {
            run(second);

            assertThat(logs.events("job.completed")).singleElement().satisfies(fields -> {
                assertThat(fields).containsEntry("profileReused", true);
                assertThat(fields.get("repos")).isEqualTo(
                        Map.of("total", 2, "reused", 2, "completed", 0, "skipped", 0, "failed", 0));
            });
        }

        assertThat(job(second).getStatus()).isEqualTo(AnalysisJobStatus.COMPLETED);
        assertThat(repos(second)).extracting(Repo::getStatus).containsOnly(RepoStatus.COMPLETED);
        verify(llmClient, times(2)).analyzeRepository(any());
        verify(llmClient, times(1)).aggregateProfile(any());
        ProfileReport reused = profileReportRepository.findByAnalysisJobId(second.id()).orElseThrow();
        assertThat(reused.getOverallSummary()).isEqualTo("종합 요약");
        assertThat(reused.getGreenFlags()).containsExactly("꾸준한 테스트");
        assertThat(reused.getWidgetSvgLight()).contains("2 pinned repos");
        assertThat(repos(first)).hasSize(2);
    }

    @Test
    void analyzesOnlyRepositoriesUpdatedSinceLastRun() {
        runNewJob();
        pinned = List.of(repo("alpha", T0), repo("beta", T0.plusSeconds(60)));
        stubPinned();

        ClaimedJob second = runNewJob();

        // alpha는 재사용하고 beta만 다시 분석한다. 지문이 달라서 프로필 리포트도 다시 만든다.
        verify(llmClient, times(3)).analyzeRepository(any());
        verify(llmClient, times(2)).aggregateProfile(any());
        assertThat(repos(second)).extracting(Repo::getStatus).containsOnly(RepoStatus.COMPLETED);
    }

    @Test
    void deletesPreviousRowsForRepositoriesNoLongerPinned() {
        ClaimedJob first = runNewJob();
        pinned = List.of(repo("alpha", T0));
        stubPinned();

        runNewJob();

        assertThat(repos(first)).extracting(Repo::getName).containsExactly("alpha");
        assertThat(repoAnalysisRepository.findAll()).hasSize(2);
    }

    @Test
    void regeneratesReportWhenPreviousOneHasNoFlags() {
        when(llmClient.aggregateProfile(any())).thenReturn(report(List.of(), List.of()));
        runNewJob();

        runNewJob();

        verify(llmClient, times(2)).aggregateProfile(any());
        verify(llmClient, times(2)).analyzeRepository(any());
    }

    @Test
    void doesNotReuseReportWhenPreviousRunSkippedARepository() {
        when(gitHubClient.getRepositoryCommits("octocat", "beta", "octocat"))
                .thenReturn(List.of(commit("wip")));
        ClaimedJob first = runNewJob();
        assertThat(repos(first)).extracting(Repo::getStatus).containsExactly(RepoStatus.COMPLETED, RepoStatus.SKIPPED);
        when(gitHubClient.getRepositoryCommits("octocat", "beta", "octocat"))
                .thenReturn(List.of(commit("Implement login flow")));

        ClaimedJob second = runNewJob();

        // 지문은 분석을 마친 저장소만으로 만든다. 건너뛴 beta가 이번에는 분석되고 리포트도 다시 만든다.
        verify(llmClient, times(2)).analyzeRepository(any());
        verify(llmClient, times(2)).aggregateProfile(any());
        assertThat(repos(second)).extracting(Repo::getStatus).containsOnly(RepoStatus.COMPLETED);
    }

    @Test
    void stopsBeforeNextStepOnceTimedOut() {
        AtomicBoolean timedOut = new AtomicBoolean();
        doAnswer(invocation -> {
            timedOut.set(true);
            return analysis("alpha");
        }).when(llmClient).analyzeRepository(any());
        ClaimedJob job = newJob();

        pipeline.run(job, timedOut::get);

        assertThat(job(job).getStatus()).isEqualTo(AnalysisJobStatus.FAILED);
        assertThat(job(job).getErrorMessage()).isEqualTo("분석 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
        verify(llmClient, times(1)).analyzeRepository(any());
        verify(llmClient, never()).aggregateProfile(any());
        assertThat(repos(job)).extracting(Repo::getStatus).containsExactly(RepoStatus.COMPLETED, RepoStatus.PENDING);
    }

    @Test
    void recordsFailureEvenThoughTheThreadWasInterrupted() {
        AtomicBoolean timedOut = new AtomicBoolean();
        doAnswer(invocation -> {
            timedOut.set(true);
            Thread.currentThread().interrupt();
            throw new IllegalStateException("interrupted call");
        }).when(llmClient).analyzeRepository(any());
        ClaimedJob job = newJob();

        pipeline.run(job, timedOut::get);

        // 인터럽트 플래그가 남아 있으면 DB 연결을 얻지 못한다. 파이프라인이 지우고 FAILED를 남겨야 한다.
        assertThat(Thread.interrupted()).isFalse();
        assertThat(job(job).getStatus()).isEqualTo(AnalysisJobStatus.FAILED);
        assertThat(job(job).getErrorMessage()).isEqualTo("분석 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
        assertThat(repos(job).getFirst().getStatus()).isEqualTo(RepoStatus.ANALYZING);
    }

    @Test
    void readsUsernameFromProfileUrl() {
        assertThat(AnalysisPipelineService.usernameOf("https://github.com/octocat")).isEqualTo("octocat");
    }
}
