package pinnedsignal.analysis.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;
import pinnedsignal.analysis.entity.AnalysisJob;
import pinnedsignal.analysis.enums.AnalysisJobStatus;
import pinnedsignal.analysis.exception.StarRequiredException;
import pinnedsignal.analysis.repository.AnalysisJobRepository;
import pinnedsignal.global.github.exception.GitHubApiException;
import pinnedsignal.global.github.exception.InvalidGitHubUrlException;
import pinnedsignal.support.IntegrationTestBase;

class AnalysisRequestServiceTest extends IntegrationTestBase {

    @Autowired
    private AnalysisRequestService requestService;
    @Autowired
    private AnalysisJobRepository jobRepository;

    @Autowired
    private TransactionTemplate transactionTemplate;

    @BeforeEach
    void profileExistsAndIsStarred() {
        when(gitHubClient.hasUserStarredRepository(anyString(), anyString(), anyString())).thenReturn(true);
    }

    // PENDING인 작업을 다른 상태로 바꾼다. @Modifying 쿼리라 트랜잭션 안에서 실행한다.
    private void changeStatus(AnalysisJobStatus to, String message) {
        transactionTemplate.executeWithoutResult(status ->
                jobRepository.updateStatus(AnalysisJobStatus.PENDING, to, message, Instant.now()));
    }

    @Test
    void createsPendingJobForNormalizedProfile() {
        String jobId = requestService.requestAnalysis("github.com/octocat/");

        AnalysisJob job = jobRepository.findById(jobId).orElseThrow();
        assertThat(job.getGithubProfile()).isEqualTo("https://github.com/octocat");
        assertThat(job.getStatus()).isEqualTo(AnalysisJobStatus.PENDING);
        verify(gitHubClient).getUserProfile("octocat");
        verify(gitHubClient).hasUserStarredRepository("octocat", "jdk829355", "github_repo_analysis");
    }

    @Test
    void returnsTheSameJobWhileTheProfileIsAlreadyBeingAnalyzed() {
        String first = requestService.requestAnalysis("octocat");
        String second = requestService.requestAnalysis("https://github.com/octocat/");

        assertThat(second).isEqualTo(first);
        assertThat(jobRepository.count()).isEqualTo(1);
    }

    @Test
    void returnsTheProcessingJobToo() {
        String first = requestService.requestAnalysis("octocat");
        changeStatus(AnalysisJobStatus.PROCESSING, null);

        assertThat(requestService.requestAnalysis("octocat")).isEqualTo(first);
        assertThat(jobRepository.count()).isEqualTo(1);
    }

    @Test
    void createsNewJobOnceThePreviousOneHasFinished() {
        String first = requestService.requestAnalysis("octocat");
        changeStatus(AnalysisJobStatus.FAILED, "실패");

        String second = requestService.requestAnalysis("octocat");

        assertThat(second).isNotEqualTo(first);
        assertThat(jobRepository.count()).isEqualTo(2);
    }

    @Test
    void createsOnlyOneJobWhenTwoRequestsArriveAtTheSameTime() throws Exception {
        CompletableFuture<String> a = CompletableFuture.supplyAsync(() -> requestService.requestAnalysis("octocat"));
        CompletableFuture<String> b = CompletableFuture.supplyAsync(() -> requestService.requestAnalysis("octocat"));

        assertThat(a.get()).isEqualTo(b.get());
        assertThat(jobRepository.count()).isEqualTo(1);
    }

    @Test
    void differentProfilesGetDifferentJobs() {
        String a = requestService.requestAnalysis("octocat");
        String b = requestService.requestAnalysis("hubot");

        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void rejectsProfileThatHasNotStarredTheVerificationRepository() {
        when(gitHubClient.hasUserStarredRepository(anyString(), anyString(), anyString())).thenReturn(false);

        assertThatThrownBy(() -> requestService.requestAnalysis("octocat"))
                .isInstanceOfSatisfying(StarRequiredException.class,
                        e -> assertThat(e.getUsername()).isEqualTo("octocat"));
        assertThat(jobRepository.count()).isZero();
    }

    @Test
    void rejectsInvalidUrlBeforeCallingGitHub() {
        assertThatThrownBy(() -> requestService.requestAnalysis("not--valid"))
                .isInstanceOf(InvalidGitHubUrlException.class);

        verify(gitHubClient, never()).getUserProfile(anyString());
        assertThat(jobRepository.count()).isZero();
    }

    @Test
    void doesNotCheckStarWhenProfileDoesNotExist() {
        when(gitHubClient.getUserProfile("ghost"))
                .thenThrow(new GitHubApiException("Profile not found", 404, "/users/ghost"));

        assertThatThrownBy(() -> requestService.requestAnalysis("ghost"))
                .isInstanceOfSatisfying(GitHubApiException.class, e -> assertThat(e.getStatusCode()).isEqualTo(404));

        verify(gitHubClient, never()).hasUserStarredRepository(anyString(), anyString(), anyString());
        assertThat(jobRepository.count()).isZero();
    }

    @Test
    void leavesNoJobBehindWhenGitHubFailsDuringStarCheck() {
        when(gitHubClient.hasUserStarredRepository(anyString(), anyString(), anyString()))
                .thenThrow(new GitHubApiException("Internal Server Error", 500, "/users/octocat/starred"));

        assertThatThrownBy(() -> requestService.requestAnalysis("octocat")).isInstanceOf(GitHubApiException.class);

        assertThat(jobRepository.count()).isZero();
    }
}
