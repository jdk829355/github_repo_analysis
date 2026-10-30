package pinnedsignal.analysis.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pinnedsignal.analysis.entity.AnalysisJob;
import pinnedsignal.analysis.entity.Repo;
import pinnedsignal.analysis.entity.RepoAnalysis;
import pinnedsignal.analysis.enums.RepoStatus;
import pinnedsignal.analysis.repository.AnalysisJobRepository;
import pinnedsignal.analysis.repository.RepoAnalysisRepository;
import pinnedsignal.analysis.repository.RepoRepository;
import pinnedsignal.global.github.dto.GitHubRepository;
import pinnedsignal.global.llm.dto.RepositoryAnalysisResponse;

/**
 * 진행 상황을 DB에 남기는 짧은 트랜잭션 모음. 화면이 이 상태를 polling하므로 파이프라인 전체를 한 트랜잭션으로 묶지 않는다.
 * Node 앱의 publishEvent 호출이 모두 여기 메서드로 바뀐다.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class AnalysisProgressService {

    private final AnalysisJobRepository analysisJobRepository;
    private final RepoRepository repoRepository;
    private final RepoAnalysisRepository repoAnalysisRepository;

    // pinned 저장소 목록을 받은 직후 모두 PENDING으로 만든다. 돌려주는 목록은 입력과 같은 순서다.
    public List<Repo> createPendingRepos(String jobId, List<GitHubRepository> repositories) {
        AnalysisJob job = analysisJobRepository.getReferenceById(jobId);
        List<Repo> rows = new ArrayList<>();
        for (int position = 0; position < repositories.size(); position++) {
            GitHubRepository repository = repositories.get(position);
            rows.add(Repo.builder()
                    .analysisJob(job)
                    .name(repository.name())
                    .fullName(repository.fullName())
                    .primaryLanguage(repository.language())
                    .stars(repository.stargazersCount())
                    .forks(repository.forksCount())
                    .fork(repository.fork())
                    .archived(repository.archived())
                    .updatedAt(repository.updatedAt())
                    .status(RepoStatus.PENDING)
                    .position(position)
                    .build());
        }
        return repoRepository.saveAll(rows);
    }

    public void deleteRepos(Collection<String> repoIds) {
        repoAnalysisRepository.deleteByRepositoryIdIn(repoIds);
        repoRepository.deleteAllByIdInBatch(repoIds);
    }

    public void startRepo(String repoId) {
        repoRepository.findById(repoId).orElseThrow().markAnalyzing();
    }

    // 이전 작업의 분석을 그대로 복사한다.
    public void reuseAnalysis(String repoId, RepoAnalysis previous) {
        Repo repo = repoRepository.findById(repoId).orElseThrow();
        repoAnalysisRepository.save(RepoAnalysis.builder()
                .repository(repo)
                .repositoryName(previous.getRepositoryName())
                .summary(previous.getSummary())
                .projectType(previous.getProjectType())
                .estimatedRoles(previous.getEstimatedRoles())
                .mainContributions(previous.getMainContributions())
                .techStack(previous.getTechStack())
                .leadershipSignals(previous.getLeadershipSignals())
                .confidence(previous.getConfidence())
                .build());
        repo.markCompleted(previous.getSummary());
    }

    public void completeRepo(String repoId, RepositoryAnalysisResponse analysis) {
        Repo repo = repoRepository.findById(repoId).orElseThrow();
        repoAnalysisRepository.save(RepoAnalysis.builder()
                .repository(repo)
                .repositoryName(analysis.repositoryName())
                .summary(analysis.summary())
                .projectType(analysis.projectType())
                .estimatedRoles(analysis.estimatedRoles())
                .mainContributions(analysis.mainContributions())
                .techStack(analysis.techStack())
                .leadershipSignals(analysis.leadershipSignals())
                .confidence(analysis.confidence())
                .build());
        repo.markCompleted(analysis.summary());
    }

    public void skipRepo(String repoId) {
        repoRepository.findById(repoId).orElseThrow().markSkipped();
    }

    public void failRepo(String repoId, String userMessage) {
        repoRepository.findById(repoId).orElseThrow().markFailed(userMessage);
    }

    public void completeJob(String jobId) {
        analysisJobRepository.findById(jobId).orElseThrow().markCompleted(Instant.now());
    }

    public void failJob(String jobId, String userMessage) {
        analysisJobRepository.findById(jobId).orElseThrow().markFailed(userMessage);
    }
}
