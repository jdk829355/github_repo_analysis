package pinnedsignal.analysis.controller;

import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import pinnedsignal.analysis.dto.response.AnalysisProgressResponse;
import pinnedsignal.analysis.service.AnalysisQueryService;
import pinnedsignal.global.util.HtmxResponses;

/**
 * 진행 화면. 첫 화면과 polling 응답이 같은 조각 템플릿을 쓰므로 새로고침해도 같은 내용이 나온다.
 */
@Controller
@RequiredArgsConstructor
public class AnalysisProgressController {

    private final AnalysisQueryService analysisQueryService;

    @GetMapping("/analysis/{jobId}")
    public String page(@PathVariable String jobId, Model model) {
        AnalysisProgressResponse progress = analysisQueryService.getProgress(jobId);
        if (progress.completed()) {
            return "redirect:/report/" + progress.jobId();
        }
        model.addAttribute("progress", progress);
        return "analysis/progress";
    }

    @GetMapping("/analysis/{jobId}/progress")
    public String progress(@PathVariable String jobId, Model model, HttpServletResponse response) {
        AnalysisProgressResponse progress = analysisQueryService.getProgress(jobId);
        if (progress.completed()) {
            HtmxResponses.redirect(response, "/report/" + progress.jobId());
            return null;
        }
        if (progress.failed()) {
            response.setStatus(HtmxResponses.STOP_POLLING);
        }
        model.addAttribute("progress", progress);
        return "analysis/fragments/progress :: progress";
    }
}
