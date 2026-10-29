package pinnedsignal.analysis.repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import pinnedsignal.analysis.entity.Repo;

public interface RepoRepository extends JpaRepository<Repo, String> {

    List<Repo> findByAnalysisJobIdOrderByPositionAsc(String analysisJobId);
}
