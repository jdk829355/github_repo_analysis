package pinnedsignal.analysis.service;

import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pinnedsignal.analysis.dto.response.AnalysisProgressResponse;
import pinnedsignal.analysis.dto.response.AnalysisProgressResponse.RepoProgress;
import pinnedsignal.analysis.dto.response.CompletedAnalysis;
import pinnedsignal.analysis.dto.response.CompletedAnalysis.RepoSummary;
import pinnedsignal.analysis.entity.AnalysisJob;
import pinnedsignal.analysis.entity.Repo;
import pinnedsignal.analysis.enums.AnalysisJobStatus;
import pinnedsignal.analysis.enums.RepoStatus;
import pinnedsignal.analysis.repository.AnalysisJobRepository;
import pinnedsignal.analysis.repository.RepoRepository;
import pinnedsignal.global.exception.NotFoundException;
import pinnedsignal.global.util.GitHubUrls;

// 화면이 읽는 쪽. 상태를 쓰는 AnalysisProgressService와 나눠 둔다.
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AnalysisQueryService {

    private final AnalysisJobRepository analysisJobRepository;
    private final RepoRepository repoRepository;

    public AnalysisProgressResponse getProgress(String jobId) {
        AnalysisJob job = analysisJobRepository.findById(jobId)
                .orElseThrow(() -> new NotFoundException("analysis job not found: " + jobId));
        List<Repo> repos = repoRepository.findByAnalysisJobIdOrderByPositionAsc(jobId);

        int finished = (int) repos.stream().filter(repo -> isFinished(repo.getStatus())).count();
        List<RepoProgress> progress = repos.stream()
                .map(repo -> new RepoProgress(
                        repo.getName(), repo.getStatus(), summaryOf(repo), repo.getErrorMessage()))
                .toList();

        return new AnalysisProgressResponse(
                job.getId(), job.getGithubProfile(), job.getStatus(), job.getErrorMessage(),
                repos.size(), finished, progress);
    }

    /** COMPLETED가 아닌 작업은 없는 것으로 본다. */
    public Optional<CompletedAnalysis> findCompleted(String jobId) {
        return analysisJobRepository.findById(jobId)
                .filter(job -> job.getStatus() == AnalysisJobStatus.COMPLETED)
                .map(job -> new CompletedAnalysis(
                        job.getId(),
                        job.getGithubProfile(),
                        repoRepository.findByAnalysisJobIdOrderByPositionAsc(jobId).stream()
                                .map(repo -> new RepoSummary(
                                        repo.getName(), repo.getDescription(), repo.getPrimaryLanguage(),
                                        repo.getStars(), repo.getStatus()))
                                .toList()));
    }

    /** 사용자의 가장 최근 COMPLETED 작업 id. */
    public Optional<String> findLatestCompletedJobId(String username) {
        return analysisJobRepository.findFirstByGithubProfileIgnoreCaseAndStatusOrderByCreatedAtDesc(
                        GitHubUrls.profileUrlOf(username), AnalysisJobStatus.COMPLETED)
                .map(AnalysisJob::getId);
    }

    private static boolean isFinished(RepoStatus status) {
        return status != RepoStatus.PENDING && status != RepoStatus.ANALYZING;
    }

    // description 칼럼은 분석이 끝난 뒤에만 분석 요약으로 채워진다.
    private static String summaryOf(Repo repo) {
        return repo.getStatus() == RepoStatus.COMPLETED ? repo.getDescription() : null;
    }
}
