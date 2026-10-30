package pinnedsignal.analysis.scheduler;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import pinnedsignal.analysis.service.AnalysisQueueService;
import pinnedsignal.analysis.service.ClaimedJob;

// 1초마다 큐를 보고 빈 슬롯이 있을 때만 PENDING 작업을 집어 간다.
@Slf4j
@Component
@RequiredArgsConstructor
public class AnalysisJobPoller {

    private final AnalysisQueueService queueService;
    private final AnalysisJobRunner runner;

    // 헬스 체크가 폴러가 멈추지 않았는지 보는 데 쓴다. 뜬 직후에는 첫 주기가 돌 때까지 살아 있는 것으로 본다.
    private volatile Instant lastPolledAt = Instant.now();

    /** 마지막 poll()이 끝난 뒤 maxSilence 안이면 살아 있다. */
    public boolean isAlive(Duration maxSilence) {
        return Duration.between(lastPolledAt, Instant.now()).compareTo(maxSilence) <= 0;
    }

    @Scheduled(fixedDelay = 1000)
    public void poll() {
        try {
            while (runner.tryAcquireSlot()) {
                boolean started = false;
                try {
                    Optional<ClaimedJob> job = queueService.claimNext();
                    if (job.isEmpty()) {
                        break;
                    }
                    runner.start(job.get());
                    started = true;
                } finally {
                    if (!started) {
                        runner.releaseSlot();
                    }
                }
            }
        } catch (RuntimeException e) {
            // DB가 잠시 끊겨도 폴러는 계속 돌아야 한다. 다음 주기에 다시 시도한다.
            log.atError().addKeyValue("event", "queue.poll_failed").setCause(e).log("failed to poll analysis queue");
        }
        lastPolledAt = Instant.now();
    }
}
