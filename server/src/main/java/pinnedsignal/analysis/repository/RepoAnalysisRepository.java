package pinnedsignal.analysis.repository;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import pinnedsignal.analysis.entity.RepoAnalysis;

public interface RepoAnalysisRepository extends JpaRepository<RepoAnalysis, String> {

    List<RepoAnalysis> findByRepositoryIdIn(Collection<String> repositoryIds);
}
