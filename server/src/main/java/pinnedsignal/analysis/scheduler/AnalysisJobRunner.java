package pinnedsignal.analysis.scheduler;

import jakarta.annotation.PreDestroy;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import pinnedsignal.analysis.service.AnalysisPipelineService;
import pinnedsignal.analysis.service.ClaimedJob;
import pinnedsignal.global.common.AnalysisConstants;

/**
 * 집은 작업을 스레드풀(동시 3개)에서 실행하고 제한 시간(10분)을 감시한다.
 * 제한 시간이 지나면 취소 플래그를 세우고 작업 스레드를 인터럽트한다. 파이프라인이 플래그를 보고 FAILED로 끝낸다.
 */
@Slf4j
@Component
public class AnalysisJobRunner {

    private final AnalysisPipelineService pipelineService;
    private final long timeoutMs;
    private final Semaphore slots;
    private final ExecutorService executor;
    private final ScheduledExecutorService timeoutScheduler;

    @Autowired
    public AnalysisJobRunner(AnalysisPipelineService pipelineService) {
        this(pipelineService, AnalysisConstants.MAX_CONCURRENT_ANALYSIS, AnalysisConstants.ANALYSIS_TIMEOUT_MS);
    }

    AnalysisJobRunner(AnalysisPipelineService pipelineService, int maxConcurrent, long timeoutMs) {
        this.pipelineService = pipelineService;
        this.timeoutMs = timeoutMs;
        this.slots = new Semaphore(maxConcurrent);
        this.executor = Executors.newFixedThreadPool(maxConcurrent, threadFactory("analysis-"));
        this.timeoutScheduler = Executors.newSingleThreadScheduledExecutor(threadFactory("analysis-timeout-"));
    }

    private static ThreadFactory threadFactory(String prefix) {
        AtomicInteger count = new AtomicInteger();
        return runnable -> {
            Thread thread = new Thread(runnable, prefix + count.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        };
    }

    public boolean tryAcquireSlot() {
        return slots.tryAcquire();
    }

    public void releaseSlot() {
        slots.release();
    }

    /** {@link #tryAcquireSlot()}로 잡은 슬롯을 쓴다. 작업이 끝나면 슬롯을 돌려준다. */
    public void start(ClaimedJob job) {
        AtomicBoolean timedOut = new AtomicBoolean();
        AtomicReference<ScheduledFuture<?>> timer = new AtomicReference<>();

        Future<?> work = executor.submit(() -> {
            try (MDC.MDCCloseable ignored = MDC.putCloseable("jobId", job.id())) {
                pipelineService.run(job, timedOut::get);
            } catch (Throwable e) {
                // 파이프라인이 오류를 FAILED로 남기지 못한 경우다. 작업은 재시작 때 복구된다.
                log.atError().addKeyValue("event", "job.crashed").addKeyValue("jobId", job.id()).setCause(e)
                        .log("analysis job crashed");
            } finally {
                ScheduledFuture<?> scheduled = timer.get();
                if (scheduled != null) {
                    scheduled.cancel(false);
                }
                slots.release();
            }
        });

        timer.set(timeoutScheduler.schedule(() -> {
            timedOut.set(true);
            work.cancel(true);
        }, timeoutMs, TimeUnit.MILLISECONDS));
        if (work.isDone()) {
            timer.get().cancel(false);
        }
    }

    @PreDestroy
    void shutdown() {
        timeoutScheduler.shutdownNow();
        executor.shutdownNow();
    }
}
