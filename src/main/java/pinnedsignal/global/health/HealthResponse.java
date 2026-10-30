package pinnedsignal.global.health;

import java.util.Map;

/** @param checks 확인 항목별 결과. 값은 ok 또는 fail이다. */
public record HealthResponse(String status, Map<String, String> checks) {

    public boolean healthy() {
        return "ok".equals(status);
    }
}
