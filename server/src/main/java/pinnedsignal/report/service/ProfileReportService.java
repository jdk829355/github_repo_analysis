package pinnedsignal.report.service;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import pinnedsignal.analysis.entity.AnalysisJob;
import pinnedsignal.global.llm.dto.ProfileAggregationInput;
import pinnedsignal.global.llm.dto.ProfileReportResponse;
import pinnedsignal.global.llm.dto.RepositoryAnalysisResponse;
import pinnedsignal.global.llm.service.LlmClient;
import pinnedsignal.report.entity.ProfileReport;
import pinnedsignal.report.entity.RoleEstimation;
import pinnedsignal.report.repository.ProfileReportRepository;

// services/analysis/profile-aggregation.ts를 옮긴 것. LLM 종합 결과와 위젯 SVG를 profile_reports에 저장한다.
@Service
@RequiredArgsConstructor
public class ProfileReportService {

    private final ProfileReportRepository profileReportRepository;
    private final LlmClient llmClient;
    private final EntityManager entityManager;

    public Optional<ProfileReport> findByJobId(String jobId) {
        return profileReportRepository.findByAnalysisJobId(jobId);
    }

    /** 실패하면 대체 리포트를 저장하지 않고 예외를 그대로 올린다. */
    public void aggregate(String jobId, String username, List<RepositoryAnalysisResponse> analyses,
            List<String> repositoryLanguages) {
        ProfileReportResponse report = llmClient.aggregateProfile(new ProfileAggregationInput(username, analyses));
        RoleEstimation roleEstimation = new RoleEstimation(
                report.roleEstimation().primary(),
                report.roleEstimation().secondary(),
                report.roleEstimation().recommended());
        save(jobId, username, report.overallSummary(), roleEstimation, report.engineeringStrengths(),
                report.collaborationPatterns(), report.greenFlags(), report.redFlags(), repositoryLanguages);
    }

    // 이전 작업의 리포트를 그대로 복사하고 위젯 SVG만 새로 만든다.
    public void reuse(String jobId, String username, ProfileReport previous, List<String> repositoryLanguages) {
        save(jobId, username, previous.getOverallSummary(), previous.getRoleEstimation(),
                previous.getEngineeringStrengths(), previous.getCollaborationPatterns(),
                orEmpty(previous.getGreenFlags()), orEmpty(previous.getRedFlags()), repositoryLanguages);
    }

    private void save(String jobId, String username, String overallSummary, RoleEstimation roleEstimation,
            List<String> engineeringStrengths, List<String> collaborationPatterns, List<String> greenFlags,
            List<String> redFlags, List<String> repositoryLanguages) {
        WidgetSvgRenderer.Variants svgs = WidgetSvgRenderer.renderVariants(new WidgetSvgRenderer.WidgetReport(
                username, overallSummary, roleEstimation, greenFlags, redFlags, repositoryLanguages));

        profileReportRepository.save(ProfileReport.builder()
                .analysisJob(entityManager.getReference(AnalysisJob.class, jobId))
                .overallSummary(overallSummary)
                .roleEstimation(roleEstimation)
                .engineeringStrengths(engineeringStrengths)
                .collaborationPatterns(collaborationPatterns)
                .greenFlags(greenFlags)
                .redFlags(redFlags)
                .widgetSvgLight(svgs.light())
                .widgetSvgDark(svgs.dark())
                .widgetSvgUpdatedAt(Instant.now())
                .build());
    }

    private static List<String> orEmpty(List<String> values) {
        return values != null ? values : List.of();
    }
}
