package pinnedsignal.global.llm.prompt;

import org.springframework.stereotype.Component;
import pinnedsignal.global.llm.dto.ProfileAggregationInput;
import pinnedsignal.global.llm.dto.RepositoryAnalysisResponse;

// prompts/profile-aggregation.ts의 buildUserPrompt를 그대로 옮긴 것.
@Component
public class ProfileAggregationPrompt {

    private static final int SUMMARY_MAX_LENGTH = 200;

    private final PromptTemplate template = new PromptTemplate("prompts/profile-aggregation.txt");

    public String render(ProfileAggregationInput input) {
        return template.render(buildUserPrompt(input));
    }

    private static String buildUserPrompt(ProfileAggregationInput input) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("Analyze the GitHub profile for user: ").append(input.username()).append("\n\n");
        prompt.append("This profile contains ").append(input.repositoryAnalyses().size())
                .append(" repository analysis(ies).\n\n");

        prompt.append("## Repository Analyses\n\n");

        for (RepositoryAnalysisResponse repo : input.repositoryAnalyses()) {
            String leadershipSignals = String.join(", ", repo.leadershipSignals());
            // JS의 substring(0, 200)과 같게 UTF-16 코드 단위로 자른다.
            String summary = repo.summary().length() > SUMMARY_MAX_LENGTH
                    ? repo.summary().substring(0, SUMMARY_MAX_LENGTH) : repo.summary();

            prompt.append("--- ").append(repo.repositoryName()).append(" ---\n");
            prompt.append("Type: ").append(repo.projectType())
                    .append(" | Roles: ").append(String.join(", ", repo.estimatedRoles()))
                    .append(" | Confidence: ").append(PromptTemplate.formatNumber(repo.confidence())).append('\n');
            prompt.append("Tech: ").append(String.join(", ", repo.techStack()))
                    .append(" | Contributions: ").append(String.join(", ", repo.mainContributions())).append('\n');
            prompt.append("Leadership signals: ").append(leadershipSignals.isEmpty() ? "None observed" : leadershipSignals)
                    .append('\n');
            prompt.append("Summary: ").append(summary).append("\n\n");
        }

        prompt.append("Based on all repository analyses above, synthesize a comprehensive developer profile with "
                + "explicit green flags and red flags.\n");

        return prompt.toString();
    }
}
