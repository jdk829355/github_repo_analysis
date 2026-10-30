package pinnedsignal.analysis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import pinnedsignal.analysis.exception.StarRequiredException;
import pinnedsignal.analysis.service.AnalysisRequestService;
import pinnedsignal.global.exception.UserMessages;
import pinnedsignal.global.github.exception.GitHubApiException;
import pinnedsignal.global.github.exception.InvalidGitHubUrlException;
import pinnedsignal.support.LogCapture;

@WebMvcTest(AnalyzeController.class)
class AnalyzeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AnalysisRequestService requestService;

    @Test
    void redirectsToProgressPageWhenJobIsCreated() throws Exception {
        when(requestService.requestAnalysis("octocat")).thenReturn("job-1");

        mockMvc.perform(post("/analyze").param("url", "octocat"))
                .andExpect(status().isOk())
                .andExpect(header().string("HX-Redirect", "/analysis/job-1"))
                .andExpect(content().string(""));
    }

    @Test
    void sendsBothRequestsForTheSameProfileToTheSameJob() throws Exception {
        when(requestService.requestAnalysis("octocat")).thenReturn("job-1");

        mockMvc.perform(post("/analyze").param("url", "octocat"))
                .andExpect(header().string("HX-Redirect", "/analysis/job-1"));
        mockMvc.perform(post("/analyze").param("url", "octocat"))
                .andExpect(header().string("HX-Redirect", "/analysis/job-1"));
    }

    @Test
    void returns400WithTheValidationMessageForInvalidUrl() throws Exception {
        when(requestService.requestAnalysis("not--valid"))
                .thenThrow(new InvalidGitHubUrlException(InvalidGitHubUrlException.INVALID_MESSAGE));

        mockMvc.perform(post("/analyze").param("url", "not--valid"))
                .andExpect(status().isBadRequest())
                .andExpect(content().string(containsString("올바른 GitHub 프로필 URL을 입력해주세요")));
    }

    @Test
    void returns400ForMissingUrl() throws Exception {
        when(requestService.requestAnalysis(null))
                .thenThrow(new InvalidGitHubUrlException(InvalidGitHubUrlException.EMPTY_MESSAGE));

        mockMvc.perform(post("/analyze"))
                .andExpect(status().isBadRequest())
                .andExpect(content().string(containsString("GitHub 프로필 URL을 입력해주세요")));
    }

    @Test
    void returns403WithStarGuideWhenVerificationRepositoryIsNotStarred() throws Exception {
        when(requestService.requestAnalysis("octocat")).thenThrow(new StarRequiredException("octocat"));

        mockMvc.perform(post("/analyze").param("url", "octocat"))
                .andExpect(status().isForbidden())
                .andExpect(content().string(containsString("분석 전 계정 소유 여부를 확인합니다")))
                .andExpect(content().string(containsString("https://github.com/jdk829355/github_repo_analysis")))
                .andExpect(content().string(containsString("검증 후 분석")))
                // 다시 검증할 때 쓸 값을 조각이 직접 들고 있다.
                .andExpect(content().string(containsString("name=\"url\" value=\"https://github.com/octocat\"")))
                .andExpect(content().string(not(containsString("아직 star가 확인되지 않았습니다"))));
    }

    @Test
    void saysStarIsStillMissingWhenTheUserVerifiesAgain() throws Exception {
        when(requestService.requestAnalysis("https://github.com/octocat")).thenThrow(new StarRequiredException("octocat"));

        mockMvc.perform(post("/analyze").param("url", "https://github.com/octocat").param("confirm", "true"))
                .andExpect(status().isForbidden())
                .andExpect(content().string(containsString("아직 star가 확인되지 않았습니다")));
    }

    @Test
    void returns404WhenProfileDoesNotExist() throws Exception {
        when(requestService.requestAnalysis("ghost"))
                .thenThrow(new GitHubApiException("Profile not found", 404, "/users/ghost"));

        mockMvc.perform(post("/analyze").param("url", "ghost"))
                .andExpect(status().isNotFound())
                .andExpect(content().string(containsString("GitHub profile not found")));
    }

    @Test
    void returns429WithRetryAfterWhenRateLimited() throws Exception {
        when(requestService.requestAnalysis("octocat"))
                .thenThrow(new GitHubApiException("API rate limit exceeded", 403, "/users/octocat"));

        mockMvc.perform(post("/analyze").param("url", "octocat"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "60"))
                .andExpect(content().string(containsString("GitHub API rate limit exceeded")));
    }

    @Test
    void treatsSecondaryRateLimitMessageAsRateLimitRegardlessOfCase() throws Exception {
        when(requestService.requestAnalysis("octocat")).thenThrow(new GitHubApiException(
                "You have exceeded a Secondary Rate Limit. Please wait.", 403, "/users/octocat/starred"));

        mockMvc.perform(post("/analyze").param("url", "octocat"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "60"));
    }

    @Test
    void returns502AndLogsWhenTokenLacksPermission() throws Exception {
        when(requestService.requestAnalysis("octocat")).thenThrow(new GitHubApiException(
                "Resource not accessible by personal access token", 403, "/users/octocat/starred"));

        try (LogCapture logs = LogCapture.of(AnalyzeController.class)) {
            mockMvc.perform(post("/analyze").param("url", "octocat"))
                    .andExpect(status().isBadGateway())
                    .andExpect(header().doesNotExist("Retry-After"))
                    .andExpect(content().string(containsString("서버의 GitHub 토큰 권한을 확인해야 합니다.")));

            assertThat(logs.events("api.error")).singleElement().satisfies(event -> {
                assertThat(event).containsEntry("route", "/analyze").containsEntry("status", 502);
                assertThat(event).containsEntry("level", "ERROR");
            });
        }
    }

    @Test
    void returns500WithFixedMessageForGitHubServerErrors() throws Exception {
        when(requestService.requestAnalysis("octocat"))
                .thenThrow(new GitHubApiException("Internal Server Error", 500, "/users/octocat"));

        mockMvc.perform(post("/analyze").param("url", "octocat"))
                .andExpect(status().isInternalServerError())
                .andExpect(content().string(containsString(UserMessages.INTERNAL_ERROR_MESSAGE)))
                .andExpect(content().string(not(containsString("Internal Server Error"))));
    }

    @Test
    void returns500WithFixedMessageAndLogsDetailsForUnexpectedErrors() throws Exception {
        when(requestService.requestAnalysis("octocat")).thenThrow(new IllegalStateException("Database connection failed"));

        try (LogCapture logs = LogCapture.of(AnalyzeController.class)) {
            mockMvc.perform(post("/analyze").param("url", "octocat"))
                    .andExpect(status().isInternalServerError())
                    .andExpect(content().string(containsString(UserMessages.INTERNAL_ERROR_MESSAGE)))
                    .andExpect(content().string(not(containsString("Database connection failed"))));

            assertThat(logs.events("api.error")).singleElement()
                    .satisfies(event -> assertThat(event).containsEntry("status", 500));
        }
    }
}
