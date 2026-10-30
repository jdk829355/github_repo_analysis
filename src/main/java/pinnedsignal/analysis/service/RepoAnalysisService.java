package pinnedsignal.analysis.service;

import java.util.List;
import java.util.concurrent.CancellationException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import pinnedsignal.analysis.enums.RepoStatus;
import pinnedsignal.global.exception.UserMessages;
import pinnedsignal.global.github.dto.GitHubCommit;
import pinnedsignal.global.github.dto.GitHubRepository;
import pinnedsignal.global.github.exception.GitHubApiException;
import pinnedsignal.global.github.service.GitHubClient;
import pinnedsignal.global.llm.dto.RepositoryAnalysisInput;
import pinnedsignal.global.llm.dto.RepositoryAnalysisResponse;
import pinnedsignal.global.llm.service.LlmClient;
import pinnedsignal.global.util.CommitFilter;

// services/analysis/repo-analysis.ts를 옮긴 것. 저장소 하나를 분석하고, 실패해도 예외 대신 FAILED로 돌려준다.
@Slf4j
@Service
@RequiredArgsConstructor
public class RepoAnalysisService {

    private final GitHubClient gitHubClient;
    private final LlmClient llmClient;
    private final AnalysisProgressService progressService;

    /**
     * @param repoId repositories 행의 id
     * @param repository pinned 목록에서 받은 저장소. 메타데이터를 다시 조회하지 않고 이 값을 쓴다.
     * @return COMPLETED, SKIPPED, FAILED 중 하나
     */
    public RepoStatus analyze(String username, String repoId, GitHubRepository repository) {
        long startedAt = System.currentTimeMillis();
        String owner = repository.owner() != null ? repository.owner() : username;

        try {
            progressService.startRepo(repoId);

            String readme = fetchReadme(owner, repository.name());
            List<GitHubCommit> commits = gitHubClient.getRepositoryCommits(owner, repository.name(), username);
            List<GitHubCommit> filtered = CommitFilter.filterCommits(commits, GitHubCommit::message);

            if (filtered.isEmpty()) {
                progressService.skipRepo(repoId);
                log.atInfo()
                        .addKeyValue("event", "repo.skipped")
                        .addKeyValue("repo", repository.name())
                        .addKeyValue("reason", "insufficient commits")
                        .addKeyValue("commitCount", commits.size())
                        .log("repository analysis skipped");
                return RepoStatus.SKIPPED;
            }

            RepositoryAnalysisInput input = new RepositoryAnalysisInput(
                    repository.name(),
                    repository.description(),
                    repository.language(),
                    repository.stargazersCount(),
                    repository.forksCount(),
                    readme,
                    filtered.stream()
                            .map(commit -> new RepositoryAnalysisInput.CommitLog(
                                    commit.message(),
                                    commit.date(),
                                    commit.authorLogin() != null ? commit.authorLogin() : "unknown"))
                            .toList());
            RepositoryAnalysisResponse analysis = llmClient.analyzeRepository(input);

            progressService.completeRepo(repoId, analysis);
            log.atInfo()
                    .addKeyValue("event", "repo.completed")
                    .addKeyValue("repo", repository.name())
                    .addKeyValue("durationMs", System.currentTimeMillis() - startedAt)
                    .addKeyValue("commitCount", filtered.size())
                    .log("repository analysis completed");
            return RepoStatus.COMPLETED;
        } catch (CancellationException e) {
            throw e;
        } catch (RuntimeException e) {
            // 타임아웃으로 인터럽트된 것이면 저장소 실패가 아니라 작업 실패다. 위로 올려서 작업을 끝낸다.
            if (Thread.currentThread().isInterrupted()) {
                throw e;
            }
            // 저장소 하나가 실패해도 작업은 계속되므로 warn으로 남긴다.
            log.atWarn()
                    .addKeyValue("event", "repo.failed")
                    .addKeyValue("repo", repository.name())
                    .addKeyValue("durationMs", System.currentTimeMillis() - startedAt)
                    .setCause(e)
                    .log("repository analysis failed");
            progressService.failRepo(repoId, UserMessages.toUserMessage(e));
            return RepoStatus.FAILED;
        }
    }

    // README가 없으면(404) README 없이 분석한다. 그 밖의 오류는 저장소 실패다.
    private String fetchReadme(String owner, String repoName) {
        try {
            String readme = gitHubClient.getRepositoryReadme(owner, repoName);
            return readme == null || readme.isEmpty() ? null : readme;
        } catch (GitHubApiException e) {
            if (e.getStatusCode() == 404) {
                return null;
            }
            throw e;
        }
    }
}
