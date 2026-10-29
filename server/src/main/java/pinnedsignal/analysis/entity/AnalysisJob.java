package pinnedsignal.analysis.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;
import pinnedsignal.analysis.enums.AnalysisJobStatus;

@Entity
@Table(name = "analysis_jobs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AnalysisJob {

    // 기존 행은 Prisma가 만든 cuid, 새 행은 UUID 문자열이다.
    @Id
    @UuidGenerator
    private String id;

    @Column(name = "github_profile", nullable = false)
    private String githubProfile;

    // Postgres enum 타입 "AnalysisJobStatus"에 매핑한다.
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(nullable = false)
    private AnalysisJobStatus status;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    // Prisma @updatedAt은 DB가 아니라 클라이언트가 채운다.
    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "error_message")
    private String errorMessage;

    public static AnalysisJob pending(String githubProfile) {
        AnalysisJob job = new AnalysisJob();
        job.githubProfile = githubProfile;
        job.status = AnalysisJobStatus.PENDING;
        return job;
    }
}
