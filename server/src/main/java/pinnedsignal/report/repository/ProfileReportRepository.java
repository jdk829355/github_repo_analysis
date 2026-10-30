package pinnedsignal.report.repository;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import pinnedsignal.report.entity.ProfileReport;

public interface ProfileReportRepository extends JpaRepository<ProfileReport, String> {

    Optional<ProfileReport> findByAnalysisJobId(String analysisJobId);
}
