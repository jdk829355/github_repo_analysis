package pinnedsignal.report.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.List;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;
import pinnedsignal.analysis.entity.AnalysisJob;

@Entity
@Table(name = "profile_reports")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ProfileReport {

    @Id
    @UuidGenerator
    private String id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "analysis_job_id", nullable = false, unique = true)
    private AnalysisJob analysisJob;

    @Column(name = "overall_summary", nullable = false)
    private String overallSummary;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "role_estimation", nullable = false)
    private RoleEstimation roleEstimation;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "engineering_strengths")
    private List<String> engineeringStrengths;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "collaboration_patterns")
    private List<String> collaborationPatterns;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "green_flags")
    private List<String> greenFlags;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "red_flags")
    private List<String> redFlags;

    @Column(name = "widget_svg_light")
    private String widgetSvgLight;

    @Column(name = "widget_svg_dark")
    private String widgetSvgDark;

    @Column(name = "widget_svg_updated_at")
    private Instant widgetSvgUpdatedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Builder
    private ProfileReport(AnalysisJob analysisJob, String overallSummary, RoleEstimation roleEstimation,
            List<String> engineeringStrengths, List<String> collaborationPatterns, List<String> greenFlags,
            List<String> redFlags, String widgetSvgLight, String widgetSvgDark, Instant widgetSvgUpdatedAt) {
        this.analysisJob = analysisJob;
        this.overallSummary = overallSummary;
        this.roleEstimation = roleEstimation;
        this.engineeringStrengths = engineeringStrengths;
        this.collaborationPatterns = collaborationPatterns;
        this.greenFlags = greenFlags;
        this.redFlags = redFlags;
        this.widgetSvgLight = widgetSvgLight;
        this.widgetSvgDark = widgetSvgDark;
        this.widgetSvgUpdatedAt = widgetSvgUpdatedAt;
    }
}
