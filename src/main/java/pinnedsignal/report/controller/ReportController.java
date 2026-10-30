package pinnedsignal.report.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import pinnedsignal.report.service.ReportQueryService;

@Controller
@RequiredArgsConstructor
public class ReportController {

    private final ReportQueryService reportQueryService;

    @GetMapping("/report/{jobId}")
    public String report(@PathVariable String jobId, Model model) {
        model.addAttribute("report", reportQueryService.getReport(jobId));
        // README에 붙일 마크다운의 주소는 요청이 들어온 origin으로 만든다.
        String origin = ServletUriComponentsBuilder.fromCurrentContextPath().toUriString();
        model.addAttribute("widgetUrl", origin + "/api/widget/" + jobId);
        model.addAttribute("reportUrl", origin + "/report/" + jobId);
        return "report/report";
    }
}
