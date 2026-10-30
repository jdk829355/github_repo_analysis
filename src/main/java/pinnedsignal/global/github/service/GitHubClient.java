package pinnedsignal.global.github.service;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriUtils;
import pinnedsignal.global.common.AnalysisConstants;
import pinnedsignal.global.common.Sleeper;
import pinnedsignal.global.github.dto.GitHubCommit;
import pinnedsignal.global.github.dto.GitHubRepository;
import pinnedsignal.global.github.dto.RepositoriesResult;
import pinnedsignal.global.github.exception.GitHubApiException;
import pinnedsignal.global.util.TextUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// services/github-client.ts를 옮긴 것. 재시도 규칙, 로그, 에러 메시지를 그대로 둔다.
@Slf4j
@Service
@RequiredArgsConstructor
public class GitHubClient {

    private static final int MAX_RETRIES = 3;
    private static final long BASE_DELAY_MS = 100;
    private static final int MAX_PER_PAGE = 100;
    // 인증 요청 한도는 시간당 5,000이다. 이 아래로 떨어지면 곧 분석이 막힌다.
    private static final int RATE_LIMIT_WARN_THRESHOLD = 100;
    private static final Pattern USER_ENDPOINT = Pattern.compile("^/users/[^/]+$");

    private static final String PINNED_REPOSITORIES_QUERY = """
                query($username: String!) {
                  user(login: $username) {
                    pinnedItems(first: 6, types: REPOSITORY) {
                      nodes {
                        ... on Repository {
                          name
                          owner { login }
                          description
                          primaryLanguage { name }
                          stargazerCount
                          forkCount
                          updatedAt
                          isFork
                          isArchived
                          diskUsage
                        }
                      }
                    }
                  }
                }
            """;

    private final RestClient gitHubRestClient;
    private final JsonMapper jsonMapper;
    private final Sleeper sleeper;

    private record RawResponse(int status, String rateLimitRemaining, byte[] body) {

        boolean ok() {
            return status >= 200 && status < 300;
        }
    }

    private static String encode(String value) {
        return UriUtils.encode(value, StandardCharsets.UTF_8);
    }

    private static Integer parseRemaining(String rateLimitRemaining) {
        if (rateLimitRemaining == null) {
            return null;
        }
        try {
            return Integer.parseInt(rateLimitRemaining.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static boolean isRetryableError(int statusCode, String rateLimitRemaining) {
        if (statusCode == 500 || statusCode == 502 || statusCode == 503) {
            return true;
        }
        if (statusCode == 403) {
            Integer remaining = parseRemaining(rateLimitRemaining);
            return remaining != null && remaining == 0;
        }
        return false;
    }

    private void warnIfRateLimitLow(String endpoint, String rateLimitRemaining) {
        Integer remaining = parseRemaining(rateLimitRemaining);
        if (remaining != null && remaining < RATE_LIMIT_WARN_THRESHOLD) {
            log.atWarn()
                    .addKeyValue("event", "github.rate_limit_low")
                    .addKeyValue("endpoint", endpoint)
                    .addKeyValue("remaining", remaining)
                    .log("GitHub rate limit running low");
        }
    }

    private void retryAfterDelay(String endpoint, int status, int attempt, String rateLimitRemaining) {
        long delay = BASE_DELAY_MS * (1L << attempt);
        log.atWarn()
                .addKeyValue("event", "github.retry")
                .addKeyValue("endpoint", endpoint)
                .addKeyValue("status", status)
                .addKeyValue("attempt", attempt + 1)
                .addKeyValue("delayMs", delay)
                .addKeyValue("rateLimitRemaining", rateLimitRemaining)
                .log("retrying GitHub request");
        sleeper.sleep(delay);
    }

    private RawResponse send(HttpMethod method, String endpoint, String body) {
        RestClient.RequestBodySpec request = gitHubRestClient.method(method).uri(endpoint);
        if (body != null) {
            request.contentType(MediaType.APPLICATION_JSON).body(body);
        }
        return request.exchange((req, response) -> new RawResponse(
                response.getStatusCode().value(),
                response.getHeaders().getFirst("x-ratelimit-remaining"),
                response.getBody().readAllBytes()));
    }

    private String errorMessage(RawResponse response) {
        try {
            JsonNode errorData = jsonMapper.readTree(response.body());
            if (errorData != null && errorData.isObject() && errorData.has("message")) {
                JsonNode message = errorData.get("message");
                return message.isString() ? message.asString() : message.toString();
            }
        } catch (RuntimeException e) {
            // 본문이 JSON이 아니면 상태 코드로 대신한다.
        }
        return "HTTP " + response.status();
    }

    private JsonNode githubRequest(String endpoint) {
        GitHubApiException lastError = null;

        for (int attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                RawResponse response = send(HttpMethod.GET, endpoint, null);
                warnIfRateLimitLow(endpoint, response.rateLimitRemaining());

                if (!response.ok()) {
                    String message = errorMessage(response);

                    if (isRetryableError(response.status(), response.rateLimitRemaining()) && attempt < MAX_RETRIES) {
                        retryAfterDelay(endpoint, response.status(), attempt, response.rateLimitRemaining());
                        continue;
                    }

                    if (response.status() == 404 && USER_ENDPOINT.matcher(endpoint).find()) {
                        throw new GitHubApiException("Profile not found", response.status(), endpoint);
                    }

                    throw new GitHubApiException(message, response.status(), endpoint);
                }

                return jsonMapper.readTree(response.body());
            } catch (GitHubApiException error) {
                lastError = error;
                if (attempt < MAX_RETRIES && isRetryableError(error.getStatusCode(), null)) {
                    retryAfterDelay(error.getEndpoint(), error.getStatusCode(), attempt, null);
                    continue;
                }
                throw error;
            }
        }

        throw lastError != null ? lastError : new GitHubApiException("Request failed after max retries", 0, endpoint);
    }

    private JsonNode githubGraphQlRequest(String query, Map<String, Object> variables) {
        String endpoint = "/graphql";
        String body = jsonMapper.writeValueAsString(Map.of("query", query, "variables", variables));
        GitHubApiException lastError = null;

        for (int attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                RawResponse response = send(HttpMethod.POST, endpoint, body);
                warnIfRateLimitLow(endpoint, response.rateLimitRemaining());

                if (!response.ok()) {
                    String message = errorMessage(response);

                    if (isRetryableError(response.status(), response.rateLimitRemaining()) && attempt < MAX_RETRIES) {
                        retryAfterDelay(endpoint, response.status(), attempt, response.rateLimitRemaining());
                        continue;
                    }

                    throw new GitHubApiException(message, response.status(), endpoint);
                }

                JsonNode json = jsonMapper.readTree(response.body());
                JsonNode errors = json.path("errors");
                if (errors.isArray() && !errors.isEmpty()) {
                    throw new GitHubApiException(errors.get(0).path("message").asString(), 400, endpoint);
                }

                JsonNode data = json.path("data");
                if (data.isMissingNode() || data.isNull()) {
                    throw new GitHubApiException("GraphQL returned no data", 500, endpoint);
                }

                return data;
            } catch (GitHubApiException error) {
                lastError = error;
                if (attempt < MAX_RETRIES && isRetryableError(error.getStatusCode(), null)) {
                    retryAfterDelay(error.getEndpoint(), error.getStatusCode(), attempt, null);
                    continue;
                }
                throw error;
            }
        }

        throw lastError != null ? lastError : new GitHubApiException("GraphQL request failed after max retries", 0, endpoint);
    }

    public JsonNode getUserProfile(String username) {
        return githubRequest("/users/" + encode(username));
    }

    public boolean hasUserStarredRepository(String username, String owner, String repo) {
        String targetFullName = (owner + "/" + repo).toLowerCase(Locale.ROOT);
        int page = 1;

        while (true) {
            String endpoint = "/users/" + encode(username) + "/starred?per_page=" + MAX_PER_PAGE + "&page=" + page;
            JsonNode starred = githubRequest(endpoint);

            if (!starred.isArray() || starred.isEmpty()) {
                return false;
            }

            for (JsonNode item : starred) {
                JsonNode fullName = item.path("full_name");
                if (fullName.isString() && fullName.asString().toLowerCase(Locale.ROOT).equals(targetFullName)) {
                    return true;
                }
            }

            if (starred.size() < MAX_PER_PAGE) {
                return false;
            }

            page++;
        }
    }

    public RepositoriesResult getUserPinnedRepositories(String username) {
        Map<String, Object> variables = new LinkedHashMap<>();
        variables.put("username", username);
        JsonNode data = githubGraphQlRequest(PINNED_REPOSITORIES_QUERY, variables);

        List<GitHubRepository> repositories = new ArrayList<>();
        int filteredCount = 0;

        for (JsonNode repo : data.path("user").path("pinnedItems").path("nodes")) {
            String owner = repo.path("owner").path("login").asString();
            String name = repo.path("name").asString();
            JsonNode primaryLanguage = repo.path("primaryLanguage");
            JsonNode description = repo.path("description");
            GitHubRepository mappedRepo = new GitHubRepository(
                    name,
                    owner + "/" + name,
                    description.isString() ? description.asString() : null,
                    primaryLanguage.isObject() && primaryLanguage.path("name").isString()
                            && !primaryLanguage.path("name").asString().isEmpty()
                            ? primaryLanguage.path("name").asString() : null,
                    repo.path("stargazerCount").asInt(),
                    repo.path("forkCount").asInt(),
                    Instant.parse(repo.path("updatedAt").asString()),
                    repo.path("isFork").asBoolean(),
                    repo.path("isArchived").asBoolean(),
                    repo.path("diskUsage").asLong() * 1024,
                    owner);

            if (mappedRepo.shouldFilter()) {
                filteredCount++;
                continue;
            }

            repositories.add(mappedRepo);
        }

        return new RepositoriesResult(repositories, filteredCount);
    }

    public RepositoriesResult getUserRepositories(String username) {
        List<GitHubRepository> repositories = new ArrayList<>();
        int filteredCount = 0;
        int page = 1;

        while (repositories.size() < AnalysisConstants.MAX_REPOS) {
            String endpoint = "/users/" + encode(username) + "/repos?per_page=" + MAX_PER_PAGE + "&page=" + page
                    + "&sort=updated&direction=desc";
            JsonNode pageRepos = githubRequest(endpoint);

            if (!pageRepos.isArray() || pageRepos.isEmpty()) {
                break;
            }

            for (JsonNode node : pageRepos) {
                GitHubRepository repo = GitHubRepository.fromRest(node);
                if (repo.shouldFilter()) {
                    filteredCount++;
                    continue;
                }

                repositories.add(repo);

                if (repositories.size() >= AnalysisConstants.MAX_REPOS) {
                    break;
                }
            }

            if (pageRepos.size() < MAX_PER_PAGE) {
                break;
            }

            page++;
        }

        return new RepositoriesResult(repositories, filteredCount);
    }

    public GitHubRepository getRepository(String owner, String repo) {
        return GitHubRepository.fromRest(githubRequest("/repos/" + encode(owner) + "/" + encode(repo)));
    }

    public String getRepositoryReadme(String owner, String repo) {
        JsonNode readmeData = githubRequest("/repos/" + encode(owner) + "/" + encode(repo) + "/readme");
        JsonNode content = readmeData.path("content");

        if (content.isString() && !content.asString().isEmpty() && "base64".equals(readmeData.path("encoding").asString(""))) {
            // GitHub는 base64를 60자마다 줄바꿈해서 준다. MIME 디코더가 줄바꿈을 건너뛴다.
            String decoded = new String(Base64.getMimeDecoder().decode(content.asString()), StandardCharsets.UTF_8);
            return TextUtils.truncateToMaxSize(decoded, AnalysisConstants.README_MAX_SIZE_BYTES);
        }

        return "";
    }

    public List<GitHubCommit> getRepositoryCommits(String owner, String repo, String username) {
        List<GitHubCommit> commits = new ArrayList<>();
        int page = 1;
        String author = username != null && !username.isEmpty() ? username : owner;

        while (commits.size() < AnalysisConstants.MAX_COMMITS_PER_REPO) {
            String endpoint = "/repos/" + encode(owner) + "/" + encode(repo) + "/commits?per_page=" + MAX_PER_PAGE
                    + "&page=" + page + "&author=" + encode(author);
            JsonNode pageCommits = githubRequest(endpoint);

            if (!pageCommits.isArray() || pageCommits.isEmpty()) {
                break;
            }

            for (JsonNode commit : pageCommits) {
                commits.add(GitHubCommit.fromRest(commit));
            }

            if (commits.size() > AnalysisConstants.MAX_COMMITS_PER_REPO) {
                commits = new ArrayList<>(commits.subList(0, AnalysisConstants.MAX_COMMITS_PER_REPO));
                break;
            }

            if (pageCommits.size() < MAX_PER_PAGE) {
                break;
            }

            page++;
        }

        return commits;
    }
}
