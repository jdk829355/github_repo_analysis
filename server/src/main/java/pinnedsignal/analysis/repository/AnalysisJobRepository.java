package pinnedsignal.analysis.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pinnedsignal.analysis.entity.AnalysisJob;

public interface AnalysisJobRepository extends JpaRepository<AnalysisJob, String> {
}
