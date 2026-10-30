package pinnedsignal.analysis.controller;

import jakarta.servlet.http.HttpServletResponse;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import pinnedsignal.analysis.dto.request.AnalyzeRequest;
import pinnedsignal.analysis.exception.StarRequiredException;
import pinnedsignal.analysis.service.AnalysisRequestService;
import pinnedsignal.global.common.AnalysisConstants;
import pinnedsignal.global.exception.UserMessages;
import pinnedsignal.global.github.exception.GitHubApiException;
import pinnedsignal.global.github.exception.InvalidGitHubUrlException;
import pinnedsignal.global.util.GitHubUrls;
import pinnedsignal.global.util.HtmxResponses;

/**
 * 메인 화면의 분석 요청 폼(HTMX). 성공하면 HX-Redirect로 진행 화면에 보내고,
 * 그 밖에는 폼 아래 #analyze-result 자리에 들어갈 HTML 조각을 돌려준다.
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class AnalyzeController {

    private static final String ERROR_FRAGMENT = "analysis/fragments/analyze-result :: error";
    private static final String STAR_FRAGMENT = "analysis/fragments/analyze-result :: starRequired";
    private static final String ROUTE = "/analyze";

    private final AnalysisRequestService analysisRequestService;

    @PostMapping("/analyze")
    public String analyze(AnalyzeRequest request, Model model, HttpServletResponse response) {
        try {
            String jobId = analysisRequestService.requestAnalysis(request.url());
            HtmxResponses.redirect(response, "/analysis/" + jobId);
            return null;
        } catch (StarRequiredException e) {
            response.setStatus(HttpStatus.FORBIDDEN.value());
            model.addAttribute("username", e.getUsername());
            model.addAttribute("profileUrl", GitHubUrls.profileUrlOf(e.getUsername()));
            model.addAttribute("verificationRepoUrl", AnalysisConstants.VERIFICATION_REPO_URL);
            // 안내를 보고 다시 눌렀는데도 또 star가 없는 경우다.
            model.addAttribute("stillMissing", request.isConfirmation());
            return STAR_FRAGMENT;
        }
    }

    @ExceptionHandler(InvalidGitHubUrlException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public String invalidUrl(InvalidGitHubUrlException e, Model model) {
        return error(model, e.getMessage());
    }

    @ExceptionHandler(GitHubApiException.class)
    public String gitHubError(GitHubApiException e, Model model, HttpServletResponse response) {
        if (e.getStatusCode() == 404) {
            response.setStatus(HttpStatus.NOT_FOUND.value());
            return error(model, "GitHub profile not found");
        }
        if (e.getStatusCode() == 403) {
            if (e.getMessage() != null && e.getMessage().toLowerCase(Locale.ROOT).contains("rate limit")) {
                response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
                response.setHeader("Retry-After", "60");
                return error(model, "GitHub API rate limit exceeded");
            }
            // 운영자가 토큰을 고쳐야 하는 문제라 error로 남긴다.
            logApiError(HttpStatus.BAD_GATEWAY, e, "GitHub token is missing a required permission");
            response.setStatus(HttpStatus.BAD_GATEWAY.value());
            return error(model, "서버의 GitHub 토큰 권한을 확인해야 합니다.");
        }
        return internalError(e, model, response);
    }

    @ExceptionHandler(Exception.class)
    public String unexpected(Exception e, Model model, HttpServletResponse response) throws Exception {
        // 요청 형식 오류(400) 같은 것은 Spring이 원래 상태 코드로 처리하도록 넘긴다.
        if (e instanceof ErrorResponse) {
            throw e;
        }
        return internalError(e, model, response);
    }

    private String internalError(Exception e, Model model, HttpServletResponse response) {
        logApiError(HttpStatus.INTERNAL_SERVER_ERROR, e, "API request failed");
        response.setStatus(HttpStatus.INTERNAL_SERVER_ERROR.value());
        return error(model, UserMessages.INTERNAL_ERROR_MESSAGE);
    }

    private static String error(Model model, String message) {
        model.addAttribute("message", message);
        return ERROR_FRAGMENT;
    }

    private void logApiError(HttpStatus status, Exception e, String message) {
        log.atError()
                .addKeyValue("event", "api.error")
                .addKeyValue("route", ROUTE)
                .addKeyValue("status", status.value())
                .setCause(e)
                .log(message);
    }
}
