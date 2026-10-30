package pinnedsignal.analysis.repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import pinnedsignal.analysis.entity.Repo;
import pinnedsignal.analysis.enums.RepoStatus;

public interface RepoRepository extends JpaRepository<Repo, String> {

    List<Repo> findByAnalysisJobIdOrderByPositionAsc(String analysisJobId);

    List<Repo> findByAnalysisJobIdAndStatusOrderByPositionAsc(String analysisJobId, RepoStatus status);
}
