package pinnedsignal.global.health;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class HealthController {

    private final HealthCheckService healthCheckService;

    @GetMapping("/api/health")
    public ResponseEntity<HealthResponse> health() {
        HealthResponse health = healthCheckService.check();
        return ResponseEntity.status(health.healthy() ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(health);
    }
}
