package pinnedsignal.analysis.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
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

@Entity
@Table(name = "repository_analyses")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RepoAnalysis {

    @Id
    @UuidGenerator
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "repository_id", nullable = false)
    private Repo repository;

    @Column(name = "repository_name", nullable = false)
    private String repositoryName;

    @Column(nullable = false)
    private String summary;

    @Column(name = "project_type", nullable = false)
    private String projectType;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "estimated_roles")
    private List<String> estimatedRoles;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "main_contributions")
    private List<String> mainContributions;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "tech_stack")
    private List<String> techStack;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "leadership_signals")
    private List<String> leadershipSignals;

    @Column(nullable = false)
    private double confidence;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Builder
    private RepoAnalysis(Repo repository, String repositoryName, String summary, String projectType,
            List<String> estimatedRoles, List<String> mainContributions, List<String> techStack,
            List<String> leadershipSignals, double confidence) {
        this.repository = repository;
        this.repositoryName = repositoryName;
        this.summary = summary;
        this.projectType = projectType;
        this.estimatedRoles = estimatedRoles;
        this.mainContributions = mainContributions;
        this.techStack = techStack;
        this.leadershipSignals = leadershipSignals;
        this.confidence = confidence;
    }
}
