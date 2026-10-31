package pinnedsignal.report.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import pinnedsignal.report.dto.response.ReportResponse;
import pinnedsignal.report.service.ReportQueryService;

@Controller
@RequiredArgsConstructor
public class ReportController {

    private final ReportQueryService reportQueryService;

    @GetMapping("/report/{jobId}")
    public String report(@PathVariable String jobId, Model model) {
        ReportResponse report = reportQueryService.getReport(jobId);
        model.addAttribute("report", report);
        // README에 붙일 마크다운의 주소는 요청이 들어온 origin으로 만든다.
        // 재분석해도 README가 최신 결과를 가리키도록 작업 id가 아니라 사용자 기준 주소를 쓴다.
        String origin = ServletUriComponentsBuilder.fromCurrentContextPath().toUriString();
        model.addAttribute("widgetUrl", origin + "/api/widget/user/" + report.username());
        model.addAttribute("reportUrl", origin + "/report/user/" + report.username());
        return "report/report";
    }

    @GetMapping("/report/user/{username}")
    public String latestReport(@PathVariable String username) {
        return "redirect:/report/" + reportQueryService.getLatestJobId(username);
    }
}
