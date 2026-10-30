package pinnedsignal.analysis.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import pinnedsignal.analysis.entity.AnalysisJob;
import pinnedsignal.analysis.enums.AnalysisJobStatus;
import pinnedsignal.analysis.repository.AnalysisJobRepository;
import pinnedsignal.support.IntegrationTestBase;

class AnalysisQueueServiceTest extends IntegrationTestBase {

    @Autowired
    private AnalysisQueueService queueService;
    @Autowired
    private AnalysisJobRepository jobRepository;
    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private TransactionTemplate transactionTemplate;

    // created_at은 자동으로 채워지므로, 오래된 순서를 확인하려고 시각을 직접 정한다.
    private String pendingJob(String username, int minutesAgo) {
        String id = jobRepository.save(AnalysisJob.pending("https://github.com/" + username)).getId();
        jdbcTemplate.update("UPDATE analysis_jobs SET created_at = ? WHERE id = ?",
                java.sql.Timestamp.from(Instant.now().minusSeconds(minutesAgo * 60L)), id);
        return id;
    }

    private AnalysisJobStatus statusOf(String id) {
        return jobRepository.findById(id).orElseThrow().getStatus();
    }

    @Test
    void claimsOldestPendingJobFirstAndMarksItProcessing() {
        String newer = pendingJob("newer", 1);
        String older = pendingJob("older", 5);

        Optional<ClaimedJob> first = queueService.claimNext();
        Optional<ClaimedJob> second = queueService.claimNext();

        assertThat(first).contains(new ClaimedJob(older, "https://github.com/older"));
        assertThat(second).contains(new ClaimedJob(newer, "https://github.com/newer"));
        assertThat(statusOf(older)).isEqualTo(AnalysisJobStatus.PROCESSING);
        assertThat(statusOf(newer)).isEqualTo(AnalysisJobStatus.PROCESSING);
    }

    @Test
    void returnsEmptyWhenNothingIsPending() {
        String id = pendingJob("octocat", 1);
        queueService.claimNext();

        assertThat(queueService.claimNext()).isEmpty();
        assertThat(statusOf(id)).isEqualTo(AnalysisJobStatus.PROCESSING);
    }

    @Test
    void skipsJobsLockedByAnotherTransaction() {
        String first = pendingJob("first", 5);
        String second = pendingJob("second", 1);

        // 첫 작업을 집은 트랜잭션이 아직 끝나지 않았을 때 다른 트랜잭션은 기다리지 않고 다음 작업을 집는다.
        Optional<ClaimedJob> concurrent = transactionTemplate.execute(status -> {
            assertThat(queueService.claimNext()).map(ClaimedJob::id).contains(first);
            return CompletableFuture.supplyAsync(queueService::claimNext).orTimeout(10, TimeUnit.SECONDS).join();
        });

        assertThat(concurrent).map(ClaimedJob::id).contains(second);
    }

    @Test
    void failsOnlyProcessingJobsLeftByTheStoppedProcess() {
        String processing = pendingJob("processing", 3);
        queueService.claimNext();
        String pending = pendingJob("pending", 2);
        String completed = jobRepository.save(AnalysisJob.pending("https://github.com/completed")).getId();
        jdbcTemplate.update("UPDATE analysis_jobs SET status = 'COMPLETED' WHERE id = ?", completed);

        int count = queueService.failInterruptedJobs();

        assertThat(count).isEqualTo(1);
        AnalysisJob failed = jobRepository.findById(processing).orElseThrow();
        assertThat(failed.getStatus()).isEqualTo(AnalysisJobStatus.FAILED);
        assertThat(failed.getErrorMessage()).isEqualTo("서버 재시작으로 분석이 중단되었습니다");
        assertThat(statusOf(pending)).isEqualTo(AnalysisJobStatus.PENDING);
        assertThat(statusOf(completed)).isEqualTo(AnalysisJobStatus.COMPLETED);
    }
}
