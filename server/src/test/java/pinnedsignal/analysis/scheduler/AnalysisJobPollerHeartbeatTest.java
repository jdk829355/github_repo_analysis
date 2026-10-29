package pinnedsignal.analysis.scheduler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import pinnedsignal.analysis.service.AnalysisQueueService;

// 헬스 체크가 폴러가 멈췄는지 알아내는 데 쓰는 마지막 poll 시각.
class AnalysisJobPollerHeartbeatTest {

    private final AnalysisQueueService queueService = mock(AnalysisQueueService.class);
    private final AnalysisJobRunner runner = mock(AnalysisJobRunner.class);
    private final AnalysisJobPoller poller = new AnalysisJobPoller(queueService, runner);

    @Test
    void isAliveRightAfterStartup() {
        assertThat(poller.isAlive(Duration.ofSeconds(60))).isTrue();
    }

    @Test
    void isNotAliveOnceNothingHasPolledForLongerThanAllowed() throws InterruptedException {
        Thread.sleep(20);

        assertThat(poller.isAlive(Duration.ofMillis(5))).isFalse();
    }

    @Test
    void everyPollRefreshesTheHeartbeatEvenWhenTheQueueIsEmpty() throws InterruptedException {
        when(runner.tryAcquireSlot()).thenReturn(true, false);
        when(queueService.claimNext()).thenReturn(Optional.empty());
        Thread.sleep(20);

        poller.poll();

        assertThat(poller.isAlive(Duration.ofMillis(15))).isTrue();
    }

    @Test
    void keepsBeatingWhenTheDatabaseIsDown() throws InterruptedException {
        when(runner.tryAcquireSlot()).thenReturn(true, false);
        when(queueService.claimNext()).thenThrow(new IllegalStateException("db down"));
        Thread.sleep(20);

        poller.poll();

        assertThat(poller.isAlive(Duration.ofMillis(15))).isTrue();
    }
}
