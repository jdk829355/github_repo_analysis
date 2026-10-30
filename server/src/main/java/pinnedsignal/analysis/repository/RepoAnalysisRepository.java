package pinnedsignal.analysis.repository;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import pinnedsignal.analysis.entity.RepoAnalysis;

public interface RepoAnalysisRepository extends JpaRepository<RepoAnalysis, String> {

    List<RepoAnalysis> findByRepositoryIdIn(Collection<String> repositoryIds);

    // 저장소 id별로 묶어야 하는 곳에서 쓴다. 연관을 함께 읽어 프록시를 거치지 않는다.
    @Query("SELECT a FROM RepoAnalysis a JOIN FETCH a.repository WHERE a.repository.id IN :repositoryIds")
    List<RepoAnalysis> findWithRepositoryByRepositoryIdIn(Collection<String> repositoryIds);

    // 파생 삭제 메서드는 flush가 늦어져 repositories 행을 먼저 지우면 외래 키에 걸린다. 바로 실행되는 벌크 삭제로 둔다.
    @Modifying
    @Query("DELETE FROM RepoAnalysis a WHERE a.repository.id IN :repositoryIds")
    void deleteByRepositoryIdIn(Collection<String> repositoryIds);
}
