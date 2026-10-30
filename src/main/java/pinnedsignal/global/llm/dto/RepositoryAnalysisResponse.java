package pinnedsignal.global.llm.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.util.List;

// schemas/repository-analysis.ts. 모르는 필드는 무시한다(zod 기본 동작과 같다).
@JsonIgnoreProperties(ignoreUnknown = true)
public record RepositoryAnalysisResponse(
        @NotNull String repositoryName,
        @NotNull String summary,
        @NotNull String projectType,
        @NotNull List<@NotNull String> estimatedRoles,
        @NotNull List<@NotNull String> mainContributions,
        @NotNull List<@NotNull String> techStack,
        @NotNull List<@NotNull String> leadershipSignals,
        @NotNull @DecimalMin("0") @DecimalMax("1") Double confidence) {
}
