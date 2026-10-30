package pinnedsignal.report.service;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pinnedsignal.analysis.dto.response.CompletedAnalysis;
import pinnedsignal.analysis.enums.RepoStatus;
import pinnedsignal.analysis.service.AnalysisQueryService;
import pinnedsignal.global.exception.NotFoundException;
import pinnedsignal.report.dto.response.ReportResponse;
import pinnedsignal.report.dto.response.ReportResponse.RepoCard;
import pinnedsignal.report.entity.ProfileReport;
import pinnedsignal.report.entity.RoleEstimation;
import pinnedsignal.report.repository.ProfileReportRepository;

// app/report/[jobId]/page.tsx의 getReport를 옮긴 것.
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ReportQueryService {

    private final AnalysisQueryService analysisQueryService;
    private final ProfileReportRepository profileReportRepository;

    /** @throws NotFoundException 작업이 없거나 COMPLETED가 아니거나 리포트가 없을 때 */
    public ReportResponse getReport(String jobId) {
        CompletedAnalysis analysis = analysisQueryService.findCompleted(jobId)
                .orElseThrow(() -> new NotFoundException("report not found: " + jobId));
        ProfileReport report = profileReportRepository.findByAnalysisJobId(jobId)
                .orElseThrow(() -> new NotFoundException("report not found: " + jobId));

        // 분석이 끝난 저장소만 카드로 보여준다. 건너뛰거나 실패한 저장소는 진행 화면에서만 보인다.
        List<RepoCard> repositories = analysis.repos().stream()
                .filter(repo -> repo.status() == RepoStatus.COMPLETED)
                .map(repo -> new RepoCard(
                        repo.name(),
                        orEmpty(repo.summary()),
                        orEmpty(repo.language()),
                        repo.stars()))
                .toList();

        RoleEstimation role = report.getRoleEstimation();
        return new ReportResponse(
                report.getOverallSummary(),
                new RoleEstimation(role.primary(), orEmpty(role.secondary()), orEmpty(role.recommended())),
                orEmpty(report.getEngineeringStrengths()),
                orEmpty(report.getCollaborationPatterns()),
                orEmpty(report.getGreenFlags()),
                orEmpty(report.getRedFlags()),
                repositories);
    }

    private static String orEmpty(String value) {
        return value != null ? value : "";
    }

    private static List<String> orEmpty(List<String> values) {
        return values != null ? values : List.of();
    }
}
