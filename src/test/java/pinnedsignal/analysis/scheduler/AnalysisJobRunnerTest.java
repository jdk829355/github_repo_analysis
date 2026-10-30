package pinnedsignal.analysis.scheduler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import pinnedsignal.analysis.service.AnalysisPipelineService;
import pinnedsignal.analysis.service.ClaimedJob;

class AnalysisJobRunnerTest {

    private static final ClaimedJob JOB = new ClaimedJob("job-1", "https://github.com/octocat");

    private final AnalysisPipelineService pipeline = mock(AnalysisPipelineService.class);
    private AnalysisJobRunner runner;

    private AnalysisJobRunner runner(int maxConcurrent, long timeoutMs) {
        runner = new AnalysisJobRunner(pipeline, maxConcurrent, timeoutMs);
        return runner;
    }

    @AfterEach
    void tearDown() {
        runner.shutdown();
    }

    @Test
    void handsOutAtMostTheConfiguredNumberOfSlots() {
        AnalysisJobRunner runner = runner(2, 60_000);

        assertThat(runner.tryAcquireSlot()).isTrue();
        assertThat(runner.tryAcquireSlot()).isTrue();
        assertThat(runner.tryAcquireSlot()).isFalse();

        runner.releaseSlot();
        assertThat(runner.tryAcquireSlot()).isTrue();
    }

    @Test
    void returnsTheSlotWhenTheJobFinishes() throws Exception {
        AnalysisJobRunner runner = runner(1, 60_000);
        CountDownLatch finish = new CountDownLatch(1);
        doAnswer(invocation -> {
            finish.await();
            return null;
        }).when(pipeline).run(any(), any());

        assertThat(runner.tryAcquireSlot()).isTrue();
        runner.start(JOB);
        assertThat(runner.tryAcquireSlot()).isFalse();

        finish.countDown();
        await().atMost(Duration.ofSeconds(5)).until(runner::tryAcquireSlot);
    }

    @Test
    void returnsTheSlotEvenWhenThePipelineCrashes() {
        AnalysisJobRunner runner = runner(1, 60_000);
        doThrow(new IllegalStateException("db down")).when(pipeline).run(any(), any());

        assertThat(runner.tryAcquireSlot()).isTrue();
        runner.start(JOB);

        await().atMost(Duration.ofSeconds(5)).until(runner::tryAcquireSlot);
    }

    @Test
    void raisesFlagAndInterruptsTheWorkerAfterTheTimeLimit() throws Exception {
        AnalysisJobRunner runner = runner(1, 200);
        CountDownLatch finished = new CountDownLatch(1);
        AtomicBoolean interrupted = new AtomicBoolean();
        AtomicBoolean flagWhenInterrupted = new AtomicBoolean();
        doAnswer(invocation -> {
            BooleanSupplier timedOut = invocation.getArgument(1);
            try {
                Thread.sleep(30_000);
            } catch (InterruptedException e) {
                interrupted.set(true);
                flagWhenInterrupted.set(timedOut.getAsBoolean());
            }
            finished.countDown();
            return null;
        }).when(pipeline).run(any(), any());

        assertThat(runner.tryAcquireSlot()).isTrue();
        runner.start(JOB);

        assertThat(finished.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(interrupted).isTrue();
        // 플래그를 먼저 세우고 인터럽트해야 파이프라인이 타임아웃으로 구분할 수 있다.
        assertThat(flagWhenInterrupted).isTrue();
        await().atMost(Duration.ofSeconds(5)).until(runner::tryAcquireSlot);
    }

    @Test
    void doesNotRaiseFlagForJobsThatFinishInTime() throws Exception {
        AnalysisJobRunner runner = runner(1, 300);
        AtomicBoolean flag = new AtomicBoolean();
        doAnswer(invocation -> {
            BooleanSupplier timedOut = invocation.getArgument(1);
            flag.set(timedOut.getAsBoolean());
            return null;
        }).when(pipeline).run(any(), any());

        assertThat(runner.tryAcquireSlot()).isTrue();
        runner.start(JOB);
        await().atMost(Duration.ofSeconds(5)).until(runner::tryAcquireSlot);
        Thread.sleep(500);

        assertThat(flag).isFalse();
    }
}
