package pinnedsignal.analysis.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import pinnedsignal.TestcontainersConfiguration;
import pinnedsignal.analysis.entity.AnalysisJob;
import pinnedsignal.analysis.entity.Repo;
import pinnedsignal.analysis.entity.RepoAnalysis;
import pinnedsignal.analysis.enums.AnalysisJobStatus;
import pinnedsignal.analysis.enums.RepoStatus;
import pinnedsignal.report.entity.ProfileReport;
import pinnedsignal.report.entity.RoleEstimation;
import pinnedsignal.report.repository.ProfileReportRepository;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
class PersistenceMappingTest {

    private static final String PROFILE = "https://github.com/octocat";

    @Autowired
    private EntityManager entityManager;
    @Autowired
    private AnalysisJobRepository analysisJobRepository;
    @Autowired
    private RepoRepository repoRepository;
    @Autowired
    private RepoAnalysisRepository repoAnalysisRepository;
    @Autowired
    private ProfileReportRepository profileReportRepository;

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }

    @Test
    void roundTripsEnumArraysJsonAndTimestamps() {
        AnalysisJob job = analysisJobRepository.save(AnalysisJob.pending(PROFILE));
        Instant githubUpdatedAt = Instant.parse("2026-01-02T03:04:05.678Z");
        Repo repo = repoRepository.save(Repo.builder()
                .analysisJob(job).name("hello").fullName("octocat/hello").primaryLanguage("Java")
                .stars(3).forks(1).updatedAt(githubUpdatedAt).status(RepoStatus.PENDING).position(0)
                .build());
        repoAnalysisRepository.save(RepoAnalysis.builder()
                .repository(repo).repositoryName("hello").summary("요약").projectType("web-app")
                .estimatedRoles(List.of("Backend", "DevOps")).mainContributions(List.of("API 구현"))
                .techStack(List.of("Spring")).leadershipSignals(List.of()).confidence(0.8)
                .build());
        profileReportRepository.save(ProfileReport.builder()
                .analysisJob(job).overallSummary("종합")
                .roleEstimation(new RoleEstimation("Backend", List.of("DevOps"), List.of("Backend Engineer")))
                .engineeringStrengths(List.of("설계")).collaborationPatterns(List.of())
                .greenFlags(List.of("테스트")).redFlags(List.of("문서 부족"))
                .build());
        flushAndClear();

        AnalysisJob savedJob = analysisJobRepository.findById(job.getId()).orElseThrow();
        assertThat(savedJob.getStatus()).isEqualTo(AnalysisJobStatus.PENDING);
        assertThat(savedJob.getCreatedAt()).isNotNull();
        assertThat(savedJob.getUpdatedAt()).isNotNull();

        Repo savedRepo = repoRepository.findByAnalysisJobIdOrderByPositionAsc(job.getId()).getFirst();
        assertThat(savedRepo.getUpdatedAt()).isEqualTo(githubUpdatedAt);
        assertThat(savedRepo.getStatus()).isEqualTo(RepoStatus.PENDING);

        RepoAnalysis savedAnalysis = repoAnalysisRepository.findByRepositoryIdIn(List.of(repo.getId())).getFirst();
        assertThat(savedAnalysis.getEstimatedRoles()).containsExactly("Backend", "DevOps");
        assertThat(savedAnalysis.getLeadershipSignals()).isEmpty();

        ProfileReport savedReport = profileReportRepository.findByAnalysisJobId(job.getId()).orElseThrow();
        assertThat(savedReport.getRoleEstimation())
                .isEqualTo(new RoleEstimation("Backend", List.of("DevOps"), List.of("Backend Engineer")));
        assertThat(savedReport.getRedFlags()).containsExactly("문서 부족");
    }

    @Test
    void readsRowsWrittenByTheNodeApp() {
        // Prisma는 timestamp(3)에 UTC 값을 넣고, V2 이전 앱은 repositories.status를 넣지 않는다.
        entityManager.createNativeQuery("""
                INSERT INTO analysis_jobs (id, github_profile, status, created_at, updated_at, completed_at)
                VALUES ('ckjob0000000000000000000', :profile, 'COMPLETED',
                        '2026-01-02 03:04:05.678', '2026-01-02 03:04:05.678', '2026-01-02 03:10:00')
                """).setParameter("profile", PROFILE).executeUpdate();
        entityManager.createNativeQuery("""
                INSERT INTO repositories (id, analysis_job_id, name, full_name, updated_at)
                VALUES ('ckrepo000000000000000000', 'ckjob0000000000000000000', 'hello', 'octocat/hello',
                        '2025-12-31 23:59:59.999')
                """).executeUpdate();
        entityManager.createNativeQuery("""
                INSERT INTO profile_reports (id, analysis_job_id, overall_summary, role_estimation,
                                             engineering_strengths, collaboration_patterns)
                VALUES ('ckreport0000000000000000', 'ckjob0000000000000000000', '종합',
                        '{"primary":"Backend","secondary":[],"recommended":["Backend Engineer"]}',
                        ARRAY['설계'], ARRAY[]::text[])
                """).executeUpdate();
        flushAndClear();

        AnalysisJob job = analysisJobRepository.findById("ckjob0000000000000000000").orElseThrow();
        assertThat(job.getStatus()).isEqualTo(AnalysisJobStatus.COMPLETED);
        assertThat(job.getCreatedAt()).isEqualTo(Instant.parse("2026-01-02T03:04:05.678Z"));

        Repo repo = repoRepository.findById("ckrepo000000000000000000").orElseThrow();
        assertThat(repo.getStatus()).isEqualTo(RepoStatus.COMPLETED);
        assertThat(repo.getPosition()).isZero();
        assertThat(repo.getUpdatedAt()).isEqualTo(Instant.parse("2025-12-31T23:59:59.999Z"));

        ProfileReport report = profileReportRepository.findByAnalysisJobId(job.getId()).orElseThrow();
        assertThat(report.getRoleEstimation().recommended()).containsExactly("Backend Engineer");
        assertThat(report.getGreenFlags()).isEmpty();
    }

    @Test
    void allowsNewJobWhenPreviousJobOfSameProfileIsFinished() {
        AnalysisJob finished = analysisJobRepository.saveAndFlush(AnalysisJob.pending(PROFILE));
        entityManager.createNativeQuery("UPDATE analysis_jobs SET status = 'COMPLETED' WHERE id = :id")
                .setParameter("id", finished.getId()).executeUpdate();

        analysisJobRepository.saveAndFlush(AnalysisJob.pending(PROFILE));

        assertThat(analysisJobRepository.count()).isEqualTo(2);
    }

    @Test
    void rejectsSecondActiveJobOfSameProfile() {
        analysisJobRepository.saveAndFlush(AnalysisJob.pending(PROFILE));

        assertThatThrownBy(() -> analysisJobRepository.saveAndFlush(AnalysisJob.pending(PROFILE)))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("analysis_jobs_active_profile_key");
    }
}
