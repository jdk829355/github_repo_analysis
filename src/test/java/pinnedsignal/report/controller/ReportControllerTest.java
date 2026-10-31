package pinnedsignal.report.controller;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import pinnedsignal.global.exception.NotFoundException;
import pinnedsignal.report.dto.response.ReportResponse;
import pinnedsignal.report.dto.response.ReportResponse.RepoCard;
import pinnedsignal.report.entity.RoleEstimation;
import pinnedsignal.report.service.ReportQueryService;

@WebMvcTest(ReportController.class)
class ReportControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ReportQueryService reportQueryService;

    private static ReportResponse report(List<String> strengths, List<String> greenFlags, List<String> redFlags,
            List<RepoCard> repos) {
        return new ReportResponse("전체 요약 문장", new RoleEstimation("Backend", List.of("DevOps"), List.of("SRE")),
                strengths, List.of("코드 리뷰를 꼼꼼히 한다"), greenFlags, redFlags, repos, "octocat");
    }

    @Test
    void rendersEverySectionOfTheReport() throws Exception {
        when(reportQueryService.getReport("job-1")).thenReturn(report(
                List.of("강점 하나"), List.of("초록 신호"), List.of("빨강 신호"),
                List.of(new RepoCard("alpha", "알파 요약", "Java", 12))));

        mockMvc.perform(get("/report/job-1"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("GitHub Profile Analysis Report")))
                .andExpect(content().string(containsString("전체 요약 문장")))
                .andExpect(content().string(containsString("초록 신호")))
                .andExpect(content().string(containsString("빨강 신호")))
                .andExpect(content().string(containsString("alpha")))
                .andExpect(content().string(containsString("알파 요약")))
                .andExpect(content().string(containsString("★")))
                .andExpect(content().string(containsString("Backend")))
                .andExpect(content().string(containsString("DevOps")))
                .andExpect(content().string(containsString("SRE")))
                .andExpect(content().string(containsString("강점 하나")))
                .andExpect(content().string(containsString("코드 리뷰를 꼼꼼히 한다")))
                .andExpect(content().string(containsString("/js/report.js")));
    }

    @Test
    void markdownUsesTheRequestOriginAndTheUsernameForWidgetAndReportUrls() throws Exception {
        when(reportQueryService.getReport("job-1")).thenReturn(report(List.of(), List.of(), List.of(), List.of()));

        mockMvc.perform(get("/report/job-1").with(request -> {
                    request.setScheme("https");
                    request.setServerName("pinned.example.com");
                    request.setServerPort(443);
                    return request;
                }))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString(
                        "[![Pinned Signal profile widget](https://pinned.example.com/api/widget/user/octocat?theme=light)]"
                                + "(https://pinned.example.com/report/user/octocat)")))
                .andExpect(content().string(containsString(
                        "data-widget-url=\"https://pinned.example.com/api/widget/user/octocat\"")))
                .andExpect(content().string(containsString(
                        "data-report-url=\"https://pinned.example.com/report/user/octocat\"")));
    }

    @Test
    void userReportPathRedirectsToTheLatestCompletedReport() throws Exception {
        when(reportQueryService.getLatestJobId("octocat")).thenReturn("job-2");

        mockMvc.perform(get("/report/user/octocat"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", "/report/job-2"));
    }

    @Test
    void userReportPathIs404WhenThereIsNoCompletedJob() throws Exception {
        when(reportQueryService.getLatestJobId("ghost")).thenThrow(new NotFoundException("report not found: ghost"));

        mockMvc.perform(get("/report/user/ghost"))
                .andExpect(status().isNotFound());
    }

    @Test
    void emptyFlagListsShowAPlaceholderAndEmptySectionsAreLeftOut() throws Exception {
        when(reportQueryService.getReport("job-1")).thenReturn(new ReportResponse("요약",
                new RoleEstimation("Backend", List.of(), List.of()), List.of(), List.of(), List.of(), List.of(), List.of(), "octocat"));

        mockMvc.perform(get("/report/job-1"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("표시할 항목이 없습니다.")))
                .andExpect(content().string(not(containsString("Pin된 저장소"))))
                .andExpect(content().string(not(containsString("엔지니어링 강점"))))
                .andExpect(content().string(not(containsString("협업 패턴"))))
                .andExpect(content().string(not(containsString("보조:"))))
                .andExpect(content().string(not(containsString("추천:"))));
    }

    @Test
    void repositoryWithoutDescriptionOrLanguageUsesFallbacks() throws Exception {
        when(reportQueryService.getReport("job-1")).thenReturn(report(List.of(), List.of(), List.of(),
                List.of(new RepoCard("bare", "", "", 0))));

        mockMvc.perform(get("/report/job-1"))
                .andExpect(content().string(containsString("설명이 없습니다")))
                .andExpect(content().string(not(containsString("★"))));
    }

    @Test
    void onlyThreeStrengthsAreVisibleAtFirst() throws Exception {
        when(reportQueryService.getReport("job-1")).thenReturn(report(
                List.of("s1", "s2", "s3", "s4", "s5"), List.of(), List.of(), List.of()));

        mockMvc.perform(get("/report/job-1"))
                .andExpect(content().string(containsString("2개 더 보기")))
                .andExpect(content().string(containsString("id=\"strengths-toggle\"")))
                .andExpect(content().string(containsString("hidden=\"hidden\"")));
    }

    @Test
    void noToggleWhenThereAreThreeStrengthsOrFewer() throws Exception {
        when(reportQueryService.getReport("job-1")).thenReturn(report(
                List.of("s1", "s2", "s3"), List.of(), List.of(), List.of()));

        mockMvc.perform(get("/report/job-1"))
                .andExpect(content().string(not(containsString("id=\"strengths-toggle\""))))
                .andExpect(content().string(not(containsString("hidden=\"hidden\""))));
    }

    @Test
    void reportTextIsEscaped() throws Exception {
        when(reportQueryService.getReport("job-1")).thenReturn(new ReportResponse("<img src=x onerror=alert(1)>",
                new RoleEstimation("Backend", List.of(), List.of()), List.of(), List.of(), List.of(), List.of(), List.of(), "octocat"));

        mockMvc.perform(get("/report/job-1"))
                .andExpect(content().string(not(containsString("<img src=x onerror=alert(1)>"))))
                .andExpect(content().string(containsString("&lt;img src=x onerror=alert(1)&gt;")));
    }

    @Test
    void unknownOrUnfinishedJobIs404() throws Exception {
        when(reportQueryService.getReport("missing")).thenThrow(new NotFoundException("report not found: missing"));

        mockMvc.perform(get("/report/missing"))
                .andExpect(status().isNotFound())
                .andExpect(content().string(containsString("Page Not Found")));
    }
}
