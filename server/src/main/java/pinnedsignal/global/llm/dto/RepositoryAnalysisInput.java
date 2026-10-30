package pinnedsignal.global.llm.dto;

import java.util.List;

// prompts/types.ts의 RepositoryAnalysisInput. repositoryName 말고는 모두 없을 수 있다(null).
public record RepositoryAnalysisInput(
        String repositoryName,
        String description,
        String primaryLanguage,
        Integer stars,
        Integer forks,
        String readme,
        List<CommitLog> commitLogs) {

    public record CommitLog(String message, String date, String author) {
    }

    public RepositoryAnalysisInput withReadme(String newReadme) {
        return new RepositoryAnalysisInput(repositoryName, description, primaryLanguage, stars, forks, newReadme,
                commitLogs);
    }
}
