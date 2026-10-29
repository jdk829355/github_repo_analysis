package pinnedsignal.global.github.service;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.equalToJson;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.matchingJsonPath;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.github.tomakehurst.wiremock.client.MappingBuilder;
import com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder;
import com.github.tomakehurst.wiremock.client.ScenarioMappingBuilder;
import com.github.tomakehurst.wiremock.junit5.WireMockExtension;
import com.github.tomakehurst.wiremock.stubbing.Scenario;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.springframework.web.client.RestClient;
import pinnedsignal.global.config.RestClientConfig;
import pinnedsignal.global.github.dto.GitHubCommit;
import pinnedsignal.global.github.dto.GitHubRepository;
import pinnedsignal.global.github.dto.RepositoriesResult;
import pinnedsignal.global.github.exception.GitHubApiException;
import pinnedsignal.support.LogCapture;
import tools.jackson.databind.json.JsonMapper;

class GitHubClientTest {

    @RegisterExtension
    static WireMockExtension wireMock = WireMockExtension.newInstance().options(wireMockConfig().dynamicPort()).build();

    private final List<Long> sleeps = new ArrayList<>();
    private GitHubClient client;

    @BeforeEach
    void setUp() {
        RestClient restClient = RestClientConfig.gitHubRestClient(RestClient.builder(), wireMock.baseUrl(), "test-token");
        client = new GitHubClient(restClient, JsonMapper.builder().build(), sleeps::add);
    }

    private static ResponseDefinitionBuilder json(int status, String body) {
        return json(status, body, "4999");
    }

    private static ResponseDefinitionBuilder json(int status, String body, String rateLimitRemaining) {
        return aResponse().withStatus(status).withHeader("Content-Type", "application/json")
                .withHeader("x-ratelimit-remaining", rateLimitRemaining).withBody(body);
    }

    // 같은 요청에 응답을 차례로 돌려준다. 마지막 응답은 그 뒤로도 계속 돌려준다.
    private static void sequence(Supplier<MappingBuilder> request, ResponseDefinitionBuilder... responses) {
        for (int i = 0; i < responses.length; i++) {
            ScenarioMappingBuilder step = request.get().inScenario("sequence")
                    .whenScenarioStateIs(i == 0 ? Scenario.STARTED : "step-" + i)
                    .willReturn(responses[i]);
            if (i < responses.length - 1) {
                step.willSetStateTo("step-" + (i + 1));
            }
            wireMock.stubFor(step);
        }
    }

    private static String repoJson(String name, boolean fork, boolean archived, int size) {
        return """
                {"name":"%s","full_name":"testuser/%s","description":null,"language":"Java","stargazers_count":5,
                 "forks_count":1,"updated_at":"2026-01-02T03:04:05Z","fork":%s,"archived":%s,"size":%d,
                 "owner":{"login":"testuser"}}
                """.formatted(name, name, fork, archived, size);
    }

    private static String array(IntStream indexes, java.util.function.IntFunction<String> element) {
        return indexes.mapToObj(element).collect(Collectors.joining(",", "[", "]"));
    }

    @Nested
    class Requests {

        @Test
        void fetchesProfileWithAuthHeaders() {
            wireMock.stubFor(get("/users/testuser").willReturn(json(200, "{\"login\":\"testuser\"}")));

            assertThat(client.getUserProfile("testuser").path("login").asString()).isEqualTo("testuser");
            wireMock.verify(getRequestedFor(urlEqualTo("/users/testuser"))
                    .withHeader("Authorization", equalTo("Bearer test-token"))
                    .withHeader("Accept", equalTo("application/vnd.github+json"))
                    .withHeader("X-GitHub-Api-Version", equalTo("2022-11-28")));
        }

        @Test
        void throwsProfileNotFoundFor404OnUserEndpoint() {
            wireMock.stubFor(get("/users/nobody").willReturn(json(404, "{\"message\":\"Not Found\"}")));

            assertThatThrownBy(() -> client.getUserProfile("nobody"))
                    .isInstanceOfSatisfying(GitHubApiException.class, error -> {
                        assertThat(error.getMessage()).isEqualTo("Profile not found");
                        assertThat(error.getStatusCode()).isEqualTo(404);
                        assertThat(error.getEndpoint()).isEqualTo("/users/nobody");
                    });
        }

        @Test
        void usesBodyMessageForOtherErrorsWithoutRetrying() {
            wireMock.stubFor(get("/users/testuser").willReturn(json(403, "{\"message\":\"Resource not accessible\"}", "10")));

            assertThatThrownBy(() -> client.getUserProfile("testuser"))
                    .isInstanceOf(GitHubApiException.class)
                    .hasMessage("Resource not accessible");
            wireMock.verify(1, getRequestedFor(urlEqualTo("/users/testuser")));
        }

        @Test
        void usesHttpStatusWhenBodyHasNoMessage() {
            wireMock.stubFor(get("/users/testuser").willReturn(aResponse().withStatus(401).withBody("not json")));

            assertThatThrownBy(() -> client.getUserProfile("testuser")).hasMessage("HTTP 401");
        }
    }

    @Nested
    class Retries {

        @Test
        void retriesRateLimited403AndSucceeds() {
            sequence(() -> get(urlEqualTo("/users/testuser")),
                    json(403, "{\"message\":\"API rate limit exceeded\"}", "0"),
                    json(200, "{\"login\":\"testuser\"}"));

            assertThat(client.getUserProfile("testuser").path("login").asString()).isEqualTo("testuser");
            assertThat(sleeps).containsExactly(100L);
        }

        @Test
        void retries500WithExponentialBackoff() {
            sequence(() -> get(urlEqualTo("/users/testuser")),
                    json(500, "{\"message\":\"Internal Server Error\"}"),
                    json(502, "{\"message\":\"Bad Gateway\"}"),
                    json(200, "{\"login\":\"testuser\"}"));

            client.getUserProfile("testuser");

            assertThat(sleeps).containsExactly(100L, 200L);
        }

        @Test
        void throwsAfterThreeRetries() {
            wireMock.stubFor(get("/users/testuser").willReturn(json(503, "{\"message\":\"Unavailable\"}")));

            assertThatThrownBy(() -> client.getUserProfile("testuser"))
                    .isInstanceOf(GitHubApiException.class)
                    .hasMessage("Unavailable");
            wireMock.verify(4, getRequestedFor(urlEqualTo("/users/testuser")));
            assertThat(sleeps).containsExactly(100L, 200L, 400L);
        }

        @Test
        void logsEachRetryWithEndpointStatusAndDelay() {
            sequence(() -> get(urlEqualTo("/users/testuser")),
                    json(500, "{\"message\":\"boom\"}", "4000"),
                    json(200, "{}"));

            try (LogCapture logs = LogCapture.of(GitHubClient.class)) {
                client.getUserProfile("testuser");

                assertThat(logs.events("github.retry")).singleElement().satisfies(fields -> assertThat(fields)
                        .containsEntry("level", "WARN")
                        .containsEntry("endpoint", "/users/testuser")
                        .containsEntry("status", 500)
                        .containsEntry("attempt", 1)
                        .containsEntry("delayMs", 100L)
                        .containsEntry("rateLimitRemaining", "4000"));
            }
        }

        @Test
        void warnsOnlyWhenRemainingRateLimitDropsBelow100() {
            wireMock.stubFor(get("/users/low").willReturn(json(200, "{}", "99")));
            wireMock.stubFor(get("/users/healthy").willReturn(json(200, "{}", "100")));

            try (LogCapture logs = LogCapture.of(GitHubClient.class)) {
                client.getUserProfile("healthy");
                assertThat(logs.events("github.rate_limit_low")).isEmpty();

                client.getUserProfile("low");
                assertThat(logs.events("github.rate_limit_low")).singleElement().satisfies(fields -> assertThat(fields)
                        .containsEntry("endpoint", "/users/low")
                        .containsEntry("remaining", 99));
            }
        }
    }

    @Nested
    class Starred {

        private static final String PAGE_1 = "/users/testuser/starred?per_page=100&page=1";
        private static final String PAGE_2 = "/users/testuser/starred?per_page=100&page=2";

        private static String starred(String... fullNames) {
            return java.util.Arrays.stream(fullNames).map(name -> "{\"full_name\":\"" + name + "\"}")
                    .collect(Collectors.joining(",", "[", "]"));
        }

        private static String fullPageOfOthers() {
            return array(IntStream.range(0, 100), i -> "{\"full_name\":\"other/repo-" + i + "\"}");
        }

        @Test
        void findsRepositoryOnFirstPage() {
            wireMock.stubFor(get(urlEqualTo(PAGE_1)).willReturn(json(200, starred("other/x", "owner/repo"))));

            assertThat(client.hasUserStarredRepository("testuser", "owner", "repo")).isTrue();
        }

        @Test
        void returnsFalseWhenNotStarred() {
            wireMock.stubFor(get(urlEqualTo(PAGE_1)).willReturn(json(200, starred("other/x"))));

            assertThat(client.hasUserStarredRepository("testuser", "owner", "repo")).isFalse();
            wireMock.verify(1, getRequestedFor(urlPathEqualTo("/users/testuser/starred")));
        }

        @Test
        void continuesToNextPageAfterFullPage() {
            wireMock.stubFor(get(urlEqualTo(PAGE_1)).willReturn(json(200, fullPageOfOthers())));
            wireMock.stubFor(get(urlEqualTo(PAGE_2)).willReturn(json(200, starred("owner/repo"))));

            assertThat(client.hasUserStarredRepository("testuser", "owner", "repo")).isTrue();
        }

        @Test
        void returnsFalseWhenPageAfterFullPageIsEmpty() {
            wireMock.stubFor(get(urlEqualTo(PAGE_1)).willReturn(json(200, fullPageOfOthers())));
            wireMock.stubFor(get(urlEqualTo(PAGE_2)).willReturn(json(200, "[]")));

            assertThat(client.hasUserStarredRepository("testuser", "owner", "repo")).isFalse();
            wireMock.verify(2, getRequestedFor(urlPathEqualTo("/users/testuser/starred")));
        }

        @Test
        void matchesCaseInsensitivelyButExactly() {
            wireMock.stubFor(get(urlEqualTo(PAGE_1)).willReturn(json(200, starred("Owner/Repo"))));
            assertThat(client.hasUserStarredRepository("testuser", "owner", "repo")).isTrue();

            wireMock.resetAll();
            wireMock.stubFor(get(urlEqualTo(PAGE_1)).willReturn(json(200, starred("other/repo", "owner/repo-fork"))));
            assertThat(client.hasUserStarredRepository("testuser", "owner", "repo")).isFalse();
        }
    }

    @Nested
    class Repositories {

        private static String reposPage(int page) {
            return "/users/testuser/repos?per_page=100&page=" + page + "&sort=updated&direction=desc";
        }

        @Test
        void filtersForkArchivedAndEmptyRepositories() {
            wireMock.stubFor(get(urlEqualTo(reposPage(1))).willReturn(json(200, "[" + String.join(",",
                    repoJson("normal-repo", false, false, 1000),
                    repoJson("fork-repo", true, false, 1000),
                    repoJson("archived-repo", false, true, 1000),
                    repoJson("empty-repo", false, false, 0)) + "]")));

            RepositoriesResult result = client.getUserRepositories("testuser");

            assertThat(result.repositories()).extracting(GitHubRepository::name).containsExactly("normal-repo");
            assertThat(result.filteredCount()).isEqualTo(3);
            GitHubRepository repo = result.repositories().getFirst();
            assertThat(repo.fullName()).isEqualTo("testuser/normal-repo");
            assertThat(repo.description()).isNull();
            assertThat(repo.updatedAt()).isEqualTo(Instant.parse("2026-01-02T03:04:05Z"));
            assertThat(repo.owner()).isNull();
        }

        @Test
        void paginatesAndStopsAtMaxRepos() {
            wireMock.stubFor(get(urlEqualTo(reposPage(1)))
                    .willReturn(json(200, array(IntStream.range(0, 100), i -> repoJson("r" + i, i % 2 == 0, false, 1)))));
            wireMock.stubFor(get(urlEqualTo(reposPage(2)))
                    .willReturn(json(200, array(IntStream.range(100, 200), i -> repoJson("r" + i, false, false, 1)))));

            RepositoriesResult result = client.getUserRepositories("testuser");

            // 1쪽 100개 중 fork가 아닌 50개로 MAX_REPOS를 채우므로 2쪽은 요청하지 않는다.
            assertThat(result.repositories()).hasSize(50);
            assertThat(result.filteredCount()).isEqualTo(50);
            wireMock.verify(1, getRequestedFor(urlPathEqualTo("/users/testuser/repos")));
        }

        @Test
        void fetchesPinnedRepositoriesWithGraphQl() {
            wireMock.stubFor(post("/graphql").willReturn(json(200, """
                    {"data":{"user":{"pinnedItems":{"nodes":[
                      {"name":"app","owner":{"login":"Org"},"description":"설명","primaryLanguage":{"name":"Kotlin"},
                       "stargazerCount":7,"forkCount":2,"updatedAt":"2026-02-03T04:05:06Z","isFork":false,
                       "isArchived":false,"diskUsage":3},
                      {"name":"no-lang","owner":{"login":"testuser"},"description":null,"primaryLanguage":null,
                       "stargazerCount":0,"forkCount":0,"updatedAt":"2026-02-03T04:05:06Z","isFork":false,
                       "isArchived":false,"diskUsage":1},
                      {"name":"forked","owner":{"login":"testuser"},"description":null,"primaryLanguage":null,
                       "stargazerCount":0,"forkCount":0,"updatedAt":"2026-02-03T04:05:06Z","isFork":true,
                       "isArchived":false,"diskUsage":1},
                      {"name":"empty","owner":{"login":"testuser"},"description":null,"primaryLanguage":null,
                       "stargazerCount":0,"forkCount":0,"updatedAt":"2026-02-03T04:05:06Z","isFork":false,
                       "isArchived":false,"diskUsage":0}
                    ]}}}}
                    """)));

            RepositoriesResult result = client.getUserPinnedRepositories("testuser");

            assertThat(result.filteredCount()).isEqualTo(2);
            assertThat(result.repositories()).containsExactly(
                    new GitHubRepository("app", "Org/app", "설명", "Kotlin", 7, 2,
                            Instant.parse("2026-02-03T04:05:06Z"), false, false, 3072, "Org"),
                    new GitHubRepository("no-lang", "testuser/no-lang", null, null, 0, 0,
                            Instant.parse("2026-02-03T04:05:06Z"), false, false, 1024, "testuser"));
            wireMock.verify(postRequestedFor(urlEqualTo("/graphql"))
                    .withRequestBody(matchingJsonPath("$.variables", equalToJson("{\"username\":\"testuser\"}")))
                    .withRequestBody(matchingJsonPath("$.query")));
        }

        @Test
        void doesNotRetryGraphQlErrors() {
            wireMock.stubFor(post("/graphql").willReturn(json(200,
                    "{\"errors\":[{\"message\":\"Could not resolve to a User\"}]}")));

            assertThatThrownBy(() -> client.getUserPinnedRepositories("nobody"))
                    .isInstanceOfSatisfying(GitHubApiException.class, error -> {
                        assertThat(error.getMessage()).isEqualTo("Could not resolve to a User");
                        assertThat(error.getStatusCode()).isEqualTo(400);
                    });
            wireMock.verify(1, postRequestedFor(urlEqualTo("/graphql")));
        }

        @Test
        void retriesAndLogsWhenGraphQlReturnsNoData() {
            sequence(() -> post(urlEqualTo("/graphql")),
                    json(200, "{}"),
                    json(200, "{\"data\":{\"user\":{\"pinnedItems\":{\"nodes\":[]}}}}"));

            try (LogCapture logs = LogCapture.of(GitHubClient.class)) {
                assertThat(client.getUserPinnedRepositories("testuser").repositories()).isEmpty();

                assertThat(logs.events("github.retry")).singleElement().satisfies(fields -> assertThat(fields)
                        .containsEntry("endpoint", "/graphql")
                        .containsEntry("status", 500));
            }
        }
    }

    @Nested
    class Contents {

        @Test
        void decodesBase64ReadmeWithLineBreaks() {
            String encoded = Base64.getMimeEncoder().encodeToString("# 제목\n\n본문".repeat(20).getBytes(StandardCharsets.UTF_8));
            wireMock.stubFor(get("/repos/owner/repo/readme").willReturn(json(200,
                    "{\"content\":\"" + encoded.replace("\r\n", "\\n") + "\",\"encoding\":\"base64\"}")));

            assertThat(client.getRepositoryReadme("owner", "repo")).isEqualTo("# 제목\n\n본문".repeat(20));
        }

        @Test
        void truncatesReadmeTo10KiB() {
            String encoded = Base64.getEncoder().encodeToString("가".repeat(5000).getBytes(StandardCharsets.UTF_8));
            wireMock.stubFor(get("/repos/owner/repo/readme").willReturn(json(200,
                    "{\"content\":\"" + encoded + "\",\"encoding\":\"base64\"}")));

            assertThat(client.getRepositoryReadme("owner", "repo")).isEqualTo("가".repeat(3413));
        }

        @Test
        void throwsWith404WhenReadmeIsMissing() {
            wireMock.stubFor(get("/repos/owner/repo/readme").willReturn(json(404, "{\"message\":\"Not Found\"}")));

            assertThatThrownBy(() -> client.getRepositoryReadme("owner", "repo"))
                    .isInstanceOfSatisfying(GitHubApiException.class,
                            error -> assertThat(error.getStatusCode()).isEqualTo(404))
                    .hasMessage("Not Found");
        }

        private static String commitsPage(int page) {
            return "/repos/owner/repo/commits?per_page=100&page=" + page + "&author=testuser";
        }

        private static String commitJson(int i) {
            return """
                    {"sha":"sha%d","commit":{"message":"commit %d","author":{"date":"2021-01-01T00:00:00Z"}},
                     "author":%s}
                    """.formatted(i, i, i == 0 ? "null" : "{\"login\":\"testuser\"}");
        }

        @Test
        void fetchesCommitsByAuthorWithPagination() {
            wireMock.stubFor(get(urlEqualTo(commitsPage(1)))
                    .willReturn(json(200, array(IntStream.range(0, 100), Contents::commitJson))));
            wireMock.stubFor(get(urlEqualTo(commitsPage(2)))
                    .willReturn(json(200, array(IntStream.range(100, 150), Contents::commitJson))));

            List<GitHubCommit> commits = client.getRepositoryCommits("owner", "repo", "testuser");

            assertThat(commits).hasSize(150);
            assertThat(commits.getFirst()).isEqualTo(new GitHubCommit("sha0", "commit 0", "2021-01-01T00:00:00Z", null));
            assertThat(commits.get(1).authorLogin()).isEqualTo("testuser");
        }

        @Test
        void stopsAtMaxCommitsPerRepo() {
            for (int page = 1; page <= 4; page++) {
                int start = (page - 1) * 100;
                wireMock.stubFor(get(urlEqualTo(commitsPage(page)))
                        .willReturn(json(200, array(IntStream.range(start, start + 100), Contents::commitJson))));
            }

            assertThat(client.getRepositoryCommits("owner", "repo", "testuser")).hasSize(300);
            wireMock.verify(3, getRequestedFor(urlPathEqualTo("/repos/owner/repo/commits")));
        }

        @Test
        void usesOwnerAsAuthorWhenUsernameIsMissing() {
            wireMock.stubFor(get(urlEqualTo("/repos/owner/repo/commits?per_page=100&page=1&author=owner"))
                    .willReturn(json(200, "[]")));

            assertThat(client.getRepositoryCommits("owner", "repo", null)).isEmpty();
        }
    }

    @Test
    void interruptAbortsRequestWaitingForResponse() throws Exception {
        // GitHub 요청에는 타임아웃이 없다. 분석 제한 시간이 지나면 인터럽트로 끊을 수 있어야 한다(S-4).
        wireMock.stubFor(get("/users/slow").willReturn(json(200, "{}").withFixedDelay(30_000)));
        java.util.concurrent.atomic.AtomicReference<Throwable> failure = new java.util.concurrent.atomic.AtomicReference<>();
        Thread caller = new Thread(() -> {
            try {
                client.getUserProfile("slow");
            } catch (Throwable e) {
                failure.set(e);
            }
        });

        caller.start();
        Thread.sleep(500);
        long interruptedAt = System.nanoTime();
        caller.interrupt();
        caller.join(5_000);

        assertThat(caller.isAlive()).isFalse();
        assertThat(failure.get()).isNotNull();
        assertThat(System.nanoTime() - interruptedAt).isLessThan(java.util.concurrent.TimeUnit.SECONDS.toNanos(5));
    }

    @Test
    void keepsFieldsForLogging() {
        assertThat(new GitHubApiException("x", 404, "/users/x").logFields())
                .isEqualTo(Map.of("statusCode", 404, "endpoint", "/users/x"));
    }
}
