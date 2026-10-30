package pinnedsignal.analysis.controller;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import pinnedsignal.analysis.dto.response.AnalysisProgressResponse;
import pinnedsignal.analysis.dto.response.AnalysisProgressResponse.RepoProgress;
import pinnedsignal.analysis.enums.AnalysisJobStatus;
import pinnedsignal.analysis.enums.RepoStatus;
import pinnedsignal.analysis.service.AnalysisQueryService;
import pinnedsignal.global.exception.NotFoundException;

@WebMvcTest(AnalysisProgressController.class)
class AnalysisProgressControllerTest {

    private static final String POLLING_URL = "hx-get=\"/analysis/job-1/progress\"";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AnalysisQueryService queryService;

    private static AnalysisProgressResponse progress(AnalysisJobStatus status, String error, RepoProgress... repos) {
        int finished = (int) List.of(repos).stream()
                .filter(repo -> repo.status() != RepoStatus.PENDING && repo.status() != RepoStatus.ANALYZING).count();
        return new AnalysisProgressResponse("job-1", "https://github.com/octocat", status, error,
                repos.length, finished, List.of(repos));
    }

    private static RepoProgress repo(String name, RepoStatus status, String summary, String error) {
        return new RepoProgress(name, status, summary, error);
    }

    @Test
    void firstPageIsRenderedWithTheProgressFragmentAlreadyInside() throws Exception {
        when(queryService.getProgress("job-1")).thenReturn(progress(AnalysisJobStatus.PROCESSING, null,
                repo("alpha", RepoStatus.COMPLETED, "알파 요약", null),
                repo("beta", RepoStatus.ANALYZING, null, null)));

        mockMvc.perform(get("/analysis/job-1"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("<html")))
                .andExpect(content().string(containsString("/js/htmx-2.0.11.min.js")))
                .andExpect(content().string(containsString("저장소 분석 중...")))
                .andExpect(content().string(containsString(POLLING_URL)))
                .andExpect(content().string(containsString("alpha")))
                .andExpect(content().string(containsString("beta")));
    }

    @Test
    void firstPageOfACompletedJobGoesStraightToTheReport() throws Exception {
        when(queryService.getProgress("job-1")).thenReturn(progress(AnalysisJobStatus.COMPLETED, null));

        mockMvc.perform(get("/analysis/job-1"))
                .andExpect(status().isFound())
                .andExpect(redirectedUrl("/report/job-1"));
    }

    @Test
    void unknownJobIs404() throws Exception {
        when(queryService.getProgress("missing")).thenThrow(new NotFoundException("analysis job not found: missing"));

        mockMvc.perform(get("/analysis/missing")).andExpect(status().isNotFound())
                .andExpect(content().string(containsString("Page Not Found")));
        mockMvc.perform(get("/analysis/missing/progress")).andExpect(status().isNotFound());
    }

    @Test
    void waitingJobShowsPendingRowAndKeepsPolling() throws Exception {
        when(queryService.getProgress("job-1")).thenReturn(progress(AnalysisJobStatus.PENDING, null));

        mockMvc.perform(get("/analysis/job-1/progress"))
                .andExpect(status().isOk())
                .andExpect(content().string(not(containsString("<html"))))
                .andExpect(content().string(containsString("시작 대기 중...")))
                .andExpect(content().string(containsString("hx-trigger=\"every 2s\"")))
                .andExpect(content().string(containsString("hx-swap=\"outerHTML\"")))
                .andExpect(content().string(containsString(POLLING_URL)));
    }

    @Test
    void jobThatHasNotFetchedRepositoriesYetSaysSo() throws Exception {
        when(queryService.getProgress("job-1")).thenReturn(progress(AnalysisJobStatus.PROCESSING, null));

        mockMvc.perform(get("/analysis/job-1/progress"))
                .andExpect(content().string(containsString("저장소 목록을 불러오는 중...")))
                .andExpect(content().string(containsString("<span>?</span>")));
    }

    @Test
    void showsEachRepositoryWithItsStateAndCounts() throws Exception {
        when(queryService.getProgress("job-1")).thenReturn(progress(AnalysisJobStatus.PROCESSING, null,
                repo("done-repo", RepoStatus.COMPLETED, "완료된 저장소 요약", null),
                repo("broken-repo", RepoStatus.FAILED, null, "분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."),
                repo("empty-repo", RepoStatus.SKIPPED, null, null),
                repo("running-repo", RepoStatus.ANALYZING, null, null),
                repo("waiting-repo", RepoStatus.PENDING, null, null)));

        mockMvc.perform(get("/analysis/job-1/progress"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("완료된 저장소 요약")))
                .andExpect(content().string(containsString("분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.")))
                .andExpect(content().string(containsString("분석할 커밋이 없어 건너뛰었습니다.")))
                .andExpect(content().string(containsString("Complete")))
                .andExpect(content().string(containsString("Failed")))
                .andExpect(content().string(containsString("Skipped")))
                .andExpect(content().string(containsString("Analyzing")))
                .andExpect(content().string(containsString("Pending")))
                // 완료·실패·건너뜀 3개가 끝난 것이다.
                .andExpect(content().string(containsString("<span>3</span>")))
                .andExpect(content().string(containsString("<span>5</span>")))
                .andExpect(content().string(containsString("width: 60%")))
                .andExpect(content().string(not(containsString("프로필을 종합하는 중..."))));
    }

    @Test
    void whenEveryRepositoryIsFinishedItSaysTheProfileIsBeingAggregated() throws Exception {
        when(queryService.getProgress("job-1")).thenReturn(progress(AnalysisJobStatus.PROCESSING, null,
                repo("a", RepoStatus.COMPLETED, "요약", null),
                repo("b", RepoStatus.SKIPPED, null, null)));

        mockMvc.perform(get("/analysis/job-1/progress"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("프로필을 종합하는 중...")))
                .andExpect(content().string(containsString(POLLING_URL)));
    }

    @Test
    void completedJobRedirectsTheBrowserToTheReport() throws Exception {
        when(queryService.getProgress("job-1")).thenReturn(progress(AnalysisJobStatus.COMPLETED, null,
                repo("a", RepoStatus.COMPLETED, "요약", null)));

        mockMvc.perform(get("/analysis/job-1/progress"))
                .andExpect(status().isOk())
                .andExpect(header().string("HX-Redirect", "/report/job-1"))
                .andExpect(content().string(""));
    }

    @Test
    void failedJobStopsPollingWith286AndShowsTheFailureWithRetry() throws Exception {
        when(queryService.getProgress("job-1")).thenReturn(progress(AnalysisJobStatus.FAILED,
                "고정(pinned)된 저장소가 없어 분석할 수 없습니다."));

        mockMvc.perform(get("/analysis/job-1/progress"))
                .andExpect(status().is(286))
                .andExpect(content().string(containsString("분석 실패")))
                .andExpect(content().string(containsString("고정(pinned)된 저장소가 없어 분석할 수 없습니다.")))
                .andExpect(content().string(containsString("다시 시도")))
                .andExpect(content().string(containsString("name=\"url\" value=\"https://github.com/octocat\"")))
                .andExpect(content().string(not(containsString("hx-trigger"))));
    }

    @Test
    void failedJobWithoutMessageFallsBackToTheDefaultOne() throws Exception {
        when(queryService.getProgress("job-1")).thenReturn(progress(AnalysisJobStatus.FAILED, null));

        mockMvc.perform(get("/analysis/job-1/progress"))
                .andExpect(status().is(286))
                .andExpect(content().string(containsString("분석에 실패했습니다")));
    }

    @Test
    void failedJobIsAlsoRenderedOnTheFirstPageWithoutPolling() throws Exception {
        when(queryService.getProgress("job-1")).thenReturn(progress(AnalysisJobStatus.FAILED, "서버 재시작으로 분석이 중단되었습니다"));

        mockMvc.perform(get("/analysis/job-1"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("서버 재시작으로 분석이 중단되었습니다")))
                .andExpect(content().string(not(containsString("hx-trigger"))));
    }

    @Test
    void repositoryTextIsEscaped() throws Exception {
        when(queryService.getProgress("job-1")).thenReturn(progress(AnalysisJobStatus.PROCESSING, null,
                repo("<script>alert(1)</script>", RepoStatus.COMPLETED, "<b>요약</b>", null)));

        mockMvc.perform(get("/analysis/job-1/progress"))
                .andExpect(content().string(not(containsString("<script>alert(1)</script>"))))
                .andExpect(content().string(containsString("&lt;script&gt;alert(1)&lt;/script&gt;")))
                .andExpect(content().string(containsString("&lt;b&gt;요약&lt;/b&gt;")));
    }
}
