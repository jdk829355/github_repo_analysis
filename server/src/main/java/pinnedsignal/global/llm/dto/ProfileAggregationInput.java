package pinnedsignal.global.llm.dto;

import java.util.List;

public record ProfileAggregationInput(String username, List<RepositoryAnalysisResponse> repositoryAnalyses) {
}
