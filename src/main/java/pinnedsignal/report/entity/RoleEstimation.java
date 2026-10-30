package pinnedsignal.report.entity;

import java.util.List;

// profile_reports.role_estimation(jsonb)에 들어가는 값.
public record RoleEstimation(String primary, List<String> secondary, List<String> recommended) {
}
