package pinnedsignal.analysis.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UuidGenerator;
import pinnedsignal.analysis.enums.RepoStatus;

// 테이블 이름은 repositories다. Repository로 지으면 Spring Data의 Repository와 이름이 겹친다.
@Entity
@Table(name = "repositories")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Repo {

    @Id
    @UuidGenerator
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "analysis_job_id", nullable = false)
    private AnalysisJob analysisJob;

    @Column(nullable = false)
    private String name;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    // 저장소 설명이 아니라 분석 요약이 들어간다. 리포트에서 GitHub 설명 대신 보여준다.
    private String description;

    @Column(name = "primary_language")
    private String primaryLanguage;

    @Column(nullable = false)
    private int stars;

    @Column(nullable = false)
    private int forks;

    @Column(name = "is_fork", nullable = false)
    private boolean fork;

    @Column(name = "is_archived", nullable = false)
    private boolean archived;

    // GitHub 저장소의 updatedAt이다. 이 행의 수정 시각이 아니다.
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @CreationTimestamp
    @Column(name = "fetched_at", nullable = false, updatable = false)
    private Instant fetchedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RepoStatus status;

    @Column(nullable = false)
    private int position;

    @Column(name = "error_message")
    private String errorMessage;

    @Builder
    private Repo(AnalysisJob analysisJob, String name, String fullName, String description, String primaryLanguage,
            int stars, int forks, boolean fork, boolean archived, Instant updatedAt, RepoStatus status, int position) {
        this.analysisJob = analysisJob;
        this.name = name;
        this.fullName = fullName;
        this.description = description;
        this.primaryLanguage = primaryLanguage;
        this.stars = stars;
        this.forks = forks;
        this.fork = fork;
        this.archived = archived;
        this.updatedAt = updatedAt;
        this.status = status;
        this.position = position;
    }

    public void markAnalyzing() {
        this.status = RepoStatus.ANALYZING;
    }

    public void markCompleted(String summary) {
        this.status = RepoStatus.COMPLETED;
        this.description = summary;
    }

    public void markSkipped() {
        this.status = RepoStatus.SKIPPED;
    }

    public void markFailed(String errorMessage) {
        this.status = RepoStatus.FAILED;
        this.errorMessage = errorMessage;
    }
}
