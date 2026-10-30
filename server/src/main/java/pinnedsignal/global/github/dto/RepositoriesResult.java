package pinnedsignal.global.github.dto;

import java.util.List;

public record RepositoriesResult(List<GitHubRepository> repositories, int filteredCount) {
}
