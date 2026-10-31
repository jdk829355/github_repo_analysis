package pinnedsignal.report.service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pinnedsignal.analysis.dto.response.CompletedAnalysis;
import pinnedsignal.analysis.service.AnalysisQueryService;
import pinnedsignal.global.util.GitHubUrls;
import pinnedsignal.report.entity.ProfileReport;
import pinnedsignal.report.repository.ProfileReportRepository;
import pinnedsignal.report.service.WidgetSvgRenderer.Theme;
import pinnedsignal.report.service.WidgetSvgRenderer.WidgetReport;

// app/api/widget/[jobId]/route.ts를 옮긴 것.
@Service
@RequiredArgsConstructor
public class WidgetService {

    private final AnalysisQueryService analysisQueryService;
    private final ProfileReportRepository profileReportRepository;

    /** 사용자의 가장 최근 COMPLETED 작업의 위젯. 그런 작업이 없으면 empty. */
    @Transactional
    public Optional<String> findSvgByUsername(String username, Theme theme) {
        return analysisQueryService.findLatestCompletedJobId(username)
                .flatMap(jobId -> findSvg(jobId, theme));
    }

    /**
     * 저장된 SVG가 현재 버전이면 그대로 돌려주고, 아니면 다시 만들어 저장한다.
     *
     * @return 작업이 없거나 COMPLETED가 아니거나 리포트가 없으면 empty
     */
    @Transactional
    public Optional<String> findSvg(String jobId, Theme theme) {
        Optional<CompletedAnalysis> analysis = analysisQueryService.findCompleted(jobId);
        Optional<ProfileReport> found = profileReportRepository.findByAnalysisJobId(jobId);
        if (analysis.isEmpty() || found.isEmpty()) {
            return Optional.empty();
        }
        ProfileReport report = found.get();

        String stored = theme == Theme.DARK ? report.getWidgetSvgDark() : report.getWidgetSvgLight();
        if (stored != null && stored.contains("data-widget-version=\"" + WidgetSvgRenderer.VERSION + "\"")) {
            return Optional.of(stored);
        }

        List<String> languages = analysis.get().repos().stream()
                .map(repo -> repo.language() != null ? repo.language() : "")
                .toList();
        WidgetSvgRenderer.Variants variants = WidgetSvgRenderer.renderVariants(new WidgetReport(
                GitHubUrls.usernameOf(analysis.get().githubProfile()),
                report.getOverallSummary(),
                report.getRoleEstimation(),
                orEmpty(report.getGreenFlags()),
                orEmpty(report.getRedFlags()),
                languages));
        report.updateWidgetSvgs(variants.light(), variants.dark(), Instant.now());

        return Optional.of(theme == Theme.DARK ? variants.dark() : variants.light());
    }

    private static List<String> orEmpty(List<String> values) {
        return values != null ? values : List.of();
    }
}
