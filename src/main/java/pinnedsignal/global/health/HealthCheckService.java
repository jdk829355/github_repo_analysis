package pinnedsignal.global.health;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import pinnedsignal.analysis.repository.AnalysisJobRepository;
import pinnedsignal.analysis.scheduler.AnalysisJobPoller;

/**
 * app/api/health/route.ts를 옮긴 것. Redis와 워커 수 확인은 없어지고 DB 연결과 큐 폴러가 살아 있는지를 본다.
 * 하나가 응답하지 않아도 전체가 멈추지 않도록 확인마다 시간 제한을 둔다.
 */
@Service
@RequiredArgsConstructor
public class HealthCheckService {

    static final long CHECK_TIMEOUT_MS = 3000;
    // 폴러는 1초마다 돈다. DB 연결을 기다리느라 한 번이 길어져도 이 시간 안에는 끝나야 한다.
    static final Duration POLLER_MAX_SILENCE = Duration.ofSeconds(60);

    private final AnalysisJobRepository analysisJobRepository;
    private final AnalysisJobPoller poller;

    public HealthResponse check() {
        Map<String, CompletableFuture<Boolean>> pending = new LinkedHashMap<>();
        pending.put("database", start(() -> analysisJobRepository.ping() == 1));
        pending.put("poller", start(() -> poller.isAlive(POLLER_MAX_SILENCE)));

        Map<String, String> checks = new LinkedHashMap<>();
        pending.forEach((name, result) -> checks.put(name, result.join() ? "ok" : "fail"));

        boolean healthy = checks.values().stream().allMatch("ok"::equals);
        return new HealthResponse(healthy ? "ok" : "fail", checks);
    }

    // 예외와 시간 초과는 모두 실패로 본다.
    private static CompletableFuture<Boolean> start(BooleanSupplier check) {
        return CompletableFuture.supplyAsync(check::getAsBoolean, Thread::startVirtualThread)
                .completeOnTimeout(false, CHECK_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                .exceptionally(error -> false);
    }
}
