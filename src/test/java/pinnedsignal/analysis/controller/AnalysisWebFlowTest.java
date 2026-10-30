package pinnedsignal.analysis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import pinnedsignal.analysis.enums.AnalysisJobStatus;
import pinnedsignal.analysis.repository.AnalysisJobRepository;
import pinnedsignal.analysis.scheduler.AnalysisJobPoller;
import pinnedsignal.global.github.dto.GitHubCommit;
import pinnedsignal.global.github.dto.GitHubRepository;
import pinnedsignal.global.github.dto.RepositoriesResult;
import pinnedsignal.global.llm.dto.ProfileReportResponse;
import pinnedsignal.global.llm.dto.RepositoryAnalysisResponse;
import pinnedsignal.support.IntegrationTestBase;

// 메인 → star 안내 → 진행 → 리포트 → 위젯까지, 가짜 GitHub·LLM 위에서 실제 컨텍스트와 DB로 한 번 훑는다.
class AnalysisWebFlowTest extends IntegrationTestBase {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private AnalysisJobPoller poller;
    @Autowired
    private AnalysisJobRepository jobRepository;

    @BeforeEach
    void stubGitHubAndLlm() {
        when(gitHubClient.hasUserStarredRepository(anyString(), anyString(), anyString())).thenReturn(true);
        when(gitHubClient.getUserPinnedRepositories(anyString())).thenReturn(new RepositoriesResult(List.of(
                new GitHubRepository("app", "octocat/app", null, "Java", 3, 0,
                        Instant.parse("2026-01-02T03:04:05Z"), false, false, 1024, "octocat")), 0));
        when(gitHubClient.getRepositoryReadme(anyString(), anyString())).thenReturn("# README");
        when(gitHubClient.getRepositoryCommits(anyString(), anyString(), anyString()))
                .thenReturn(List.of(new GitHubCommit("sha", "Implement login flow", "2026-01-01T00:00:00Z", "octocat")));
        when(llmClient.analyzeRepository(any())).thenReturn(new RepositoryAnalysisResponse(
                "app", "로그인 흐름을 구현한 웹 앱", "web-app", List.of("Backend"), List.of(), List.of(), List.of(), 0.8));
        when(llmClient.aggregateProfile(any())).thenReturn(new ProfileReportResponse("꾸준히 기여하는 백엔드 개발자",
                new ProfileReportResponse.RoleEstimation("Backend", List.of("DevOps"), List.of()),
                List.of("테스트를 쓴다"), List.of(), List.of("꾸준한 커밋"), List.of("문서가 적다")));
    }

    private String jobIdFromRedirect(String url) throws Exception {
        String redirect = mockMvc.perform(post("/analyze").param("url", url))
                .andExpect(status().isOk())
                .andReturn().getResponse().getHeader("HX-Redirect");
        assertThat(redirect).startsWith("/analysis/");
        return redirect.substring("/analysis/".length());
    }

    @Test
    void requestProgressReportAndWidgetWorkTogether() throws Exception {
        mockMvc.perform(get("/")).andExpect(status().isOk());

        String jobId = jobIdFromRedirect("https://github.com/octocat");

        // 큐에 들어간 직후: 시작 대기, polling 중
        mockMvc.perform(get("/analysis/" + jobId))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("시작 대기 중...")))
                .andExpect(content().string(containsString("hx-trigger=\"every 2s\"")));
        mockMvc.perform(get("/api/widget/" + jobId)).andExpect(status().isNotFound());
        mockMvc.perform(get("/report/" + jobId)).andExpect(status().isNotFound());

        poller.poll();
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                assertThat(jobRepository.findById(jobId).orElseThrow().getStatus()).isEqualTo(AnalysisJobStatus.COMPLETED));

        // 끝난 뒤: 진행 조각은 리포트로 보내고, 첫 화면 주소로 들어와도 리포트로 간다
        mockMvc.perform(get("/analysis/" + jobId + "/progress"))
                .andExpect(status().isOk())
                .andExpect(header().string("HX-Redirect", "/report/" + jobId));
        mockMvc.perform(get("/analysis/" + jobId))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", "/report/" + jobId));

        mockMvc.perform(get("/report/" + jobId))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("꾸준히 기여하는 백엔드 개발자")))
                .andExpect(content().string(containsString("꾸준한 커밋")))
                .andExpect(content().string(containsString("문서가 적다")))
                .andExpect(content().string(containsString("로그인 흐름을 구현한 웹 앱")))
                .andExpect(content().string(containsString("/api/widget/" + jobId + "?theme=light")));

        mockMvc.perform(get("/api/widget/" + jobId).param("theme", "dark"))
                .andExpect(status().isOk())
                .andExpect(content().contentType("image/svg+xml;charset=utf-8"))
                .andExpect(content().string(containsString("@ octocat")))
                .andExpect(content().string(containsString("#0D1117")));
        mockMvc.perform(get("/api/widget/" + jobId))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("#FFFFFF")));
    }

    @Test
    void secondRequestForTheSameProfileJoinsTheRunningJob() throws Exception {
        String first = jobIdFromRedirect("octocat");
        String second = jobIdFromRedirect("https://github.com/octocat/");

        assertThat(second).isEqualTo(first);
        assertThat(jobRepository.count()).isEqualTo(1);
    }

    @Test
    void failedJobStopsPollingAndRetryCreatesANewJob() throws Exception {
        when(gitHubClient.getUserPinnedRepositories(anyString())).thenReturn(new RepositoriesResult(List.of(), 0));
        String jobId = jobIdFromRedirect("octocat");

        poller.poll();
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                assertThat(jobRepository.findById(jobId).orElseThrow().getStatus()).isEqualTo(AnalysisJobStatus.FAILED));

        mockMvc.perform(get("/analysis/" + jobId + "/progress"))
                .andExpect(status().is(286))
                .andExpect(content().string(containsString("고정(pinned)된 저장소가 없어 분석할 수 없습니다.")))
                .andExpect(content().string(not(containsString("hx-trigger"))));

        String retryJobId = jobIdFromRedirect("https://github.com/octocat");
        assertThat(retryJobId).isNotEqualTo(jobId);
    }

    @Test
    void starGuideIsShownUntilTheProfileHasStarred() throws Exception {
        when(gitHubClient.hasUserStarredRepository(anyString(), anyString(), anyString())).thenReturn(false);

        mockMvc.perform(post("/analyze").param("url", "octocat"))
                .andExpect(status().isForbidden())
                .andExpect(content().string(containsString("분석 전 계정 소유 여부를 확인합니다")));
        mockMvc.perform(post("/analyze").param("url", "https://github.com/octocat").param("confirm", "true"))
                .andExpect(status().isForbidden())
                .andExpect(content().string(containsString("아직 star가 확인되지 않았습니다")));
        assertThat(jobRepository.count()).isZero();

        when(gitHubClient.hasUserStarredRepository(anyString(), anyString(), anyString())).thenReturn(true);
        mockMvc.perform(post("/analyze").param("url", "https://github.com/octocat").param("confirm", "true"))
                .andExpect(status().isOk())
                .andExpect(header().exists("HX-Redirect"));
    }

    @Test
    void healthIsOkWithDatabaseAndPoller() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.checks.database").value("ok"))
                .andExpect(jsonPath("$.checks.poller").value("ok"));
    }
}
