package pinnedsignal.analysis.repository;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pinnedsignal.analysis.entity.AnalysisJob;
import pinnedsignal.analysis.enums.AnalysisJobStatus;

public interface AnalysisJobRepository extends JpaRepository<AnalysisJob, String> {

    Optional<AnalysisJob> findFirstByGithubProfileAndStatusAndIdNotOrderByCreatedAtDesc(
            String githubProfile, AnalysisJobStatus status, String excludedId);

    // 가장 오래된 PENDING 작업 하나를 PROCESSING으로 바꾸고 id를 돌려준다. 다른 트랜잭션이 잡고 있는 행은 건너뛴다.
    // updated_at은 timestamp(3)(시간대 없음)에 UTC로 쓰므로 now()를 그대로 쓰지 않는다.
    @Query(value = """
            UPDATE analysis_jobs SET status = 'PROCESSING', updated_at = now() AT TIME ZONE 'UTC'
            WHERE id = (
              SELECT id FROM analysis_jobs
              WHERE status = 'PENDING'
              ORDER BY created_at
              FOR UPDATE SKIP LOCKED
              LIMIT 1
            )
            RETURNING id
            """, nativeQuery = true)
    Optional<String> claimNextPending();

    @Modifying
    @Query("""
            UPDATE AnalysisJob j SET j.status = :to, j.errorMessage = :message, j.updatedAt = :now
            WHERE j.status = :from
            """)
    int updateStatus(@Param("from") AnalysisJobStatus from, @Param("to") AnalysisJobStatus to,
            @Param("message") String message, @Param("now") Instant now);
}
