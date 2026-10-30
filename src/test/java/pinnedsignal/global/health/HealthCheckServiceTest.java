package pinnedsignal.global.health;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import pinnedsignal.analysis.repository.AnalysisJobRepository;
import pinnedsignal.analysis.scheduler.AnalysisJobPoller;

// tests/api/health.test.ts를 옮긴 것. Redis와 워커 대신 DB와 큐 폴러를 본다.
class HealthCheckServiceTest {

    private final AnalysisJobRepository jobRepository = mock(AnalysisJobRepository.class);
    private final AnalysisJobPoller poller = mock(AnalysisJobPoller.class);
    private final HealthCheckService service = new HealthCheckService(jobRepository, poller);

    @BeforeEach
    void everythingHealthy() {
        when(jobRepository.ping()).thenReturn(1);
        when(poller.isAlive(any())).thenReturn(true);
    }

    @Test
    void isOkWhenDatabaseAndPollerAreHealthy() {
        HealthResponse health = service.check();

        assertThat(health.healthy()).isTrue();
        assertThat(health.status()).isEqualTo("ok");
        assertThat(health.checks()).containsEntry("database", "ok").containsEntry("poller", "ok");
    }

    @Test
    void failsWhenTheDatabaseQueryFails() {
        when(jobRepository.ping()).thenThrow(new IllegalStateException("connection refused"));

        HealthResponse health = service.check();

        assertThat(health.healthy()).isFalse();
        assertThat(health.checks()).containsEntry("database", "fail").containsEntry("poller", "ok");
    }

    @Test
    void failsWhenThePollerHasStopped() {
        when(poller.isAlive(any())).thenReturn(false);

        HealthResponse health = service.check();

        assertThat(health.healthy()).isFalse();
        assertThat(health.checks()).containsEntry("database", "ok").containsEntry("poller", "fail");
    }

    @Test
    void marksACheckAsFailedWhenItDoesNotRespondInTime() {
        when(jobRepository.ping()).thenAnswer(invocation -> {
            Thread.sleep(HealthCheckService.CHECK_TIMEOUT_MS * 5);
            return 1;
        });

        long startedAt = System.currentTimeMillis();
        HealthResponse health = service.check();
        long elapsed = System.currentTimeMillis() - startedAt;

        assertThat(health.checks()).containsEntry("database", "fail").containsEntry("poller", "ok");
        assertThat(elapsed).isLessThan(HealthCheckService.CHECK_TIMEOUT_MS * 3);
    }
}
