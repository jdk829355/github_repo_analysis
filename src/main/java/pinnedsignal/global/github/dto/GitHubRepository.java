package pinnedsignal.global.github.dto;

import java.time.Instant;
import tools.jackson.databind.JsonNode;

/**
 * services/github-client.ts의 Repository 중 파이프라인이 쓰는 필드.
 * owner는 pinned 저장소 조회에서만 채운다. REST 응답으로 만들면 null이다(지금과 같다).
 */
public record GitHubRepository(
        String name,
        String fullName,
        String description,
        String language,
        int stargazersCount,
        int forksCount,
        Instant updatedAt,
        boolean fork,
        boolean archived,
        long size,
        String owner) {

    public static GitHubRepository fromRest(JsonNode node) {
        return new GitHubRepository(
                node.path("name").asString(),
                node.path("full_name").asString(),
                textOrNull(node.path("description")),
                textOrNull(node.path("language")),
                node.path("stargazers_count").asInt(),
                node.path("forks_count").asInt(),
                Instant.parse(node.path("updated_at").asString()),
                node.path("fork").asBoolean(),
                node.path("archived").asBoolean(),
                node.path("size").asLong(),
                null);
    }

    private static String textOrNull(JsonNode node) {
        return node.isNull() || node.isMissingNode() ? null : node.asString();
    }

    public boolean shouldFilter() {
        return fork || archived || size == 0;
    }
}
