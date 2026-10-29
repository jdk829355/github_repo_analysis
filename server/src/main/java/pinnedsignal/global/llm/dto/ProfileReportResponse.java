package pinnedsignal.global.llm.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;

// schemas/profile-report.ts. 모르는 필드는 무시한다(zod 기본 동작과 같다).
@JsonIgnoreProperties(ignoreUnknown = true)
public record ProfileReportResponse(
        @NotNull String overallSummary,
        @NotNull @Valid RoleEstimation roleEstimation,
        @NotNull List<@NotNull String> engineeringStrengths,
        @NotNull List<@NotNull String> collaborationPatterns,
        @NotNull List<@NotNull String> greenFlags,
        @NotNull List<@NotNull String> redFlags) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record RoleEstimation(
            @NotNull String primary,
            @NotNull List<@NotNull String> secondary,
            @NotNull List<@NotNull String> recommended) {
    }
}
