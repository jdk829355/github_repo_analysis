package pinnedsignal.global.github.dto;

import tools.jackson.databind.JsonNode;

/**
 * 커밋 응답에서 쓰는 필드만 펼쳐 담는다. date는 GitHub가 준 문자열 그대로다. 프롬프트에 그대로 들어가기 때문이다.
 * authorLogin은 GitHub 계정과 연결되지 않은 커밋이면 null이다.
 */
public record GitHubCommit(String sha, String message, String date, String authorLogin) {

    public static GitHubCommit fromRest(JsonNode node) {
        JsonNode author = node.path("author");
        return new GitHubCommit(
                node.path("sha").asString(),
                node.path("commit").path("message").asString(),
                node.path("commit").path("author").path("date").asString(),
                author.isObject() ? author.path("login").asString(null) : null);
    }
}
