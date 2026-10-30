package pinnedsignal.global.llm.prompt;

import org.springframework.stereotype.Component;
import pinnedsignal.global.llm.dto.RepositoryAnalysisInput;

// prompts/repository-analysis.ts의 buildUserPrompt를 그대로 옮긴 것.
@Component
public class RepositoryAnalysisPrompt {

    private final PromptTemplate template = new PromptTemplate("prompts/repository-analysis.txt");

    public String render(RepositoryAnalysisInput input) {
        return template.render(buildUserPrompt(input));
    }

    private static String buildUserPrompt(RepositoryAnalysisInput input) {
        StringBuilder prompt = new StringBuilder("Analyze this GitHub repository:\n\n");
        prompt.append("Repository: ").append(input.repositoryName()).append("\n\n");

        if (PromptTemplate.hasText(input.description())) {
            prompt.append("Description: ").append(input.description()).append('\n');
        }
        if (PromptTemplate.hasText(input.primaryLanguage())) {
            prompt.append("Primary Language: ").append(input.primaryLanguage()).append('\n');
        }
        if (input.stars() != null) {
            prompt.append("Stars: ").append(input.stars()).append('\n');
        }
        if (input.forks() != null) {
            prompt.append("Forks: ").append(input.forks()).append('\n');
        }
        prompt.append('\n');

        if (PromptTemplate.hasText(input.readme())) {
            prompt.append("README:\n").append(input.readme()).append("\n\n");
        }

        if (input.commitLogs() != null && !input.commitLogs().isEmpty()) {
            prompt.append("Commit History:\n");
            for (RepositoryAnalysisInput.CommitLog commit : input.commitLogs()) {
                prompt.append("- [").append(commit.date()).append("] ").append(commit.author()).append(": ")
                        .append(commit.message()).append('\n');
            }
            prompt.append('\n');
        }

        prompt.append("Based on the evidence above, especially the commit history authored by this user, identify the "
                + "user's role in this repository, their concrete contributions, the project type, tech stack, and any "
                + "leadership signals.\n");

        return prompt.toString();
    }
}
