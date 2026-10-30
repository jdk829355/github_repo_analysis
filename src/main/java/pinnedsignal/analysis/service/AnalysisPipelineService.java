package pinnedsignal.analysis.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.BooleanSupplier;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import pinnedsignal.analysis.entity.AnalysisJob;
import pinnedsignal.analysis.entity.Repo;
import pinnedsignal.analysis.entity.RepoAnalysis;
import pinnedsignal.analysis.enums.AnalysisJobStatus;
import pinnedsignal.analysis.enums.RepoStatus;
import pinnedsignal.analysis.repository.AnalysisJobRepository;
import pinnedsignal.analysis.repository.RepoAnalysisRepository;
import pinnedsignal.analysis.repository.RepoRepository;
import pinnedsignal.global.common.AnalysisConstants;
import pinnedsignal.global.exception.AnalysisException;
import pinnedsignal.global.exception.UserMessages;
import pinnedsignal.global.github.dto.GitHubRepository;
import pinnedsignal.global.github.service.GitHubClient;
import pinnedsignal.global.llm.dto.RepositoryAnalysisResponse;
import pinnedsignal.report.entity.ProfileReport;
import pinnedsignal.report.service.ProfileReportService;

/**
 * services/analysis/orchestrator.ts를 옮긴 것. 순서와 규칙은 그대로이고 진행 이벤트만 DB 상태 갱신으로 바뀌었다.
 * 어떤 오류도 밖으로 던지지 않는다. 실패는 작업을 FAILED로 남기고 job.failed 로그를 쓴다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AnalysisPipelineService {

    private static final String GITHUB_URL_PREFIX = "https://github.com/";

    private final GitHubClient gitHubClient;
    private final AnalysisJobRepository analysisJobRepository;
    private final RepoRepository repoRepository;
    private final RepoAnalysisRepository repoAnalysisRepository;
    private final AnalysisProgressService progressService;
    private final RepoAnalysisService repoAnalysisService;
    private final ProfileReportService profileReportService;

    private static final class RepoCounts {
        int total;
        int reused;
        int completed;
        int skipped;
        int failed;

        Map<String, Integer> asMap() {
            Map<String, Integer> map = new LinkedHashMap<>();
            map.put("total", total);
            map.put("reused", reused);
            map.put("completed", completed);
            map.put("skipped", skipped);
            map.put("failed", failed);
            return map;
        }
    }

    // 이전 COMPLETED 작업에서 가져올 수 있는 것들.
    private record Previous(boolean reuseProfileReport, ProfileReport profileReport,
            Map<String, RepoAnalysis> analyses) {

        static final Previous NONE = new Previous(false, null, Map.of());
    }

    /**
     * @param timedOut 분석 제한 시간이 지났는지. 지나면 다음 단계로 넘어가지 않고 FAILED로 끝낸다.
     */
    public void run(ClaimedJob job, BooleanSupplier timedOut) {
        long startedAt = System.currentTimeMillis();
        RepoCounts counts = new RepoCounts();
        boolean profileReused = false;
        String username = usernameOf(job.githubProfile());

        log.atInfo()
                .addKeyValue("event", "job.started")
                .addKeyValue("username", username)
                .log("analysis job started");

        try {
            List<GitHubRepository> repositories = gitHubClient.getUserPinnedRepositories(username).repositories();
            counts.total = repositories.size();

            if (repositories.isEmpty()) {
                throw new AnalysisException("No pinned repositories found", AnalysisException.Phase.FETCH);
            }

            List<Repo> rows = progressService.createPendingRepos(job.id(), repositories);
            Previous previous = loadPrevious(job, repositories);

            List<Integer> toAnalyze = new ArrayList<>();
            for (int i = 0; i < repositories.size(); i++) {
                RepoAnalysis reusable = previous.analyses().get(repoKey(repositories.get(i).fullName()));
                if (reusable != null) {
                    progressService.reuseAnalysis(rows.get(i).getId(), reusable);
                    counts.reused++;
                } else {
                    toAnalyze.add(i);
                }
            }

            for (int i : toAnalyze) {
                failIfTimedOut(timedOut);
                RepoStatus result = repoAnalysisService.analyze(username, rows.get(i).getId(), repositories.get(i));
                switch (result) {
                    case COMPLETED -> counts.completed++;
                    case SKIPPED -> counts.skipped++;
                    default -> counts.failed++;
                }
            }

            failIfTimedOut(timedOut);

            if (previous.reuseProfileReport()) {
                profileReused = true;
                profileReportService.reuse(job.id(), username, previous.profileReport(),
                        repositories.stream().map(repo -> repo.language() != null ? repo.language() : "").toList());
            } else {
                aggregate(job.id(), username);
            }

            failIfTimedOut(timedOut);

            progressService.completeJob(job.id());
            log.atInfo()
                    .addKeyValue("event", "job.completed")
                    .addKeyValue("durationMs", System.currentTimeMillis() - startedAt)
                    .addKeyValue("repos", counts.asMap())
                    .addKeyValue("profileReused", profileReused)
                    .log("analysis job completed");
        } catch (Exception e) {
            Exception error = e;
            if (timedOut.getAsBoolean()) {
                // 타임아웃이 인터럽트로 끊은 것이다. 플래그를 지워야 아래 DB 쓰기가 막히지 않는다.
                Thread.interrupted();
                error = timeoutException();
            }
            // 아래 정리 작업이 실패하면 원래 에러가 가려지므로 먼저 남긴다.
            log.atError()
                    .addKeyValue("event", "job.failed")
                    .addKeyValue("durationMs", System.currentTimeMillis() - startedAt)
                    .addKeyValue("repos", counts.asMap())
                    .setCause(error)
                    .log("analysis job failed");
            progressService.failJob(job.id(), UserMessages.toUserMessage(error));
        }
    }

    private static AnalysisException timeoutException() {
        return new AnalysisException(
                "Analysis timed out after " + AnalysisConstants.ANALYSIS_TIMEOUT_MS + "ms",
                AnalysisException.Phase.AGGREGATE);
    }

    private static void failIfTimedOut(BooleanSupplier timedOut) {
        if (timedOut.getAsBoolean()) {
            throw timeoutException();
        }
    }

    // github_profile은 https://github.com/{username} 형태로 저장된다.
    static String usernameOf(String githubProfile) {
        return githubProfile.substring(githubProfile.lastIndexOf('/') + 1);
    }

    private static String repoKey(String fullName) {
        return fullName.toLowerCase(Locale.ROOT);
    }

    private static String fingerprint(List<GitHubRepository> repositories) {
        return repositories.stream()
                .map(repo -> repoKey(repo.fullName()) + "@" + repo.updatedAt())
                .sorted()
                .collect(Collectors.joining("|"));
    }

    private static String fingerprintOfRows(List<Repo> rows) {
        return rows.stream()
                .map(repo -> repoKey(repo.getFullName()) + "@" + repo.getUpdatedAt())
                .sorted()
                .collect(Collectors.joining("|"));
    }

    /**
     * 같은 프로필의 직전 COMPLETED 작업에서 재사용할 분석을 고르고, 현재 pinned 목록에 없는 이전 저장소 행을 지운다.
     * 프로필 리포트 지문은 분석이 끝난 저장소(COMPLETED)만으로 만든다. 건너뛴 저장소까지 넣으면 지금과 재사용 조건이 달라진다.
     */
    private Previous loadPrevious(ClaimedJob job, List<GitHubRepository> repositories) {
        Optional<AnalysisJob> previousJob = analysisJobRepository
                .findFirstByGithubProfileAndStatusAndIdNotOrderByCreatedAtDesc(
                        job.githubProfile(), AnalysisJobStatus.COMPLETED, job.id());
        if (previousJob.isEmpty()) {
            return Previous.NONE;
        }

        String previousJobId = previousJob.get().getId();
        List<Repo> previousRepos = repoRepository.findByAnalysisJobIdOrderByPositionAsc(previousJobId);
        Map<String, RepoAnalysis> analysisByRepoId = new HashMap<>();
        if (!previousRepos.isEmpty()) {
            List<String> ids = previousRepos.stream().map(Repo::getId).toList();
            for (RepoAnalysis analysis : repoAnalysisRepository.findWithRepositoryByRepositoryIdIn(ids)) {
                analysisByRepoId.putIfAbsent(analysis.getRepository().getId(), analysis);
            }
        }

        ProfileReport report = profileReportService.findByJobId(previousJobId).orElse(null);
        boolean hasFlagSections = report != null
                && (size(report.getGreenFlags()) + size(report.getRedFlags())) > 0;
        List<Repo> completedRepos = previousRepos.stream()
                .filter(repo -> repo.getStatus() == RepoStatus.COMPLETED)
                .toList();
        boolean reuseProfileReport = hasFlagSections
                && fingerprintOfRows(completedRepos).equals(fingerprint(repositories));

        Map<String, GitHubRepository> current = repositories.stream()
                .collect(Collectors.toMap(repo -> repoKey(repo.fullName()), repo -> repo, (a, b) -> a));
        Set<String> staleRepoIds = new HashSet<>();
        Map<String, RepoAnalysis> reusable = new HashMap<>();
        for (Repo repo : previousRepos) {
            String key = repoKey(repo.getFullName());
            GitHubRepository currentRepo = current.get(key);
            if (currentRepo == null) {
                staleRepoIds.add(repo.getId());
                continue;
            }
            RepoAnalysis analysis = analysisByRepoId.get(repo.getId());
            if (analysis != null && currentRepo.updatedAt().equals(repo.getUpdatedAt())) {
                reusable.put(key, analysis);
            }
        }

        if (!staleRepoIds.isEmpty()) {
            progressService.deleteRepos(staleRepoIds);
        }
        return new Previous(reuseProfileReport, report, reusable);
    }

    private static int size(List<String> values) {
        return values == null ? 0 : values.size();
    }

    // 분석이 끝난 저장소(요약이 비지 않은 것)만 모아 LLM으로 종합한다.
    private void aggregate(String jobId, String username) {
        List<Repo> completedRepos = repoRepository.findByAnalysisJobIdAndStatusOrderByPositionAsc(
                jobId, RepoStatus.COMPLETED);
        if (completedRepos.isEmpty()) {
            throw new AnalysisException("no eligible repositories", AnalysisException.Phase.AGGREGATE);
        }

        Map<String, Integer> positions = new HashMap<>();
        for (int i = 0; i < completedRepos.size(); i++) {
            positions.put(completedRepos.get(i).getId(), i);
        }
        List<RepositoryAnalysisResponse> analyses = repoAnalysisRepository
                .findWithRepositoryByRepositoryIdIn(completedRepos.stream().map(Repo::getId).toList())
                .stream()
                .filter(analysis -> !analysis.getSummary().isBlank())
                .sorted(Comparator.comparingInt(analysis -> positions.get(analysis.getRepository().getId())))
                .map(analysis -> new RepositoryAnalysisResponse(
                        analysis.getRepositoryName(),
                        analysis.getSummary(),
                        analysis.getProjectType(),
                        analysis.getEstimatedRoles(),
                        analysis.getMainContributions(),
                        analysis.getTechStack(),
                        analysis.getLeadershipSignals(),
                        analysis.getConfidence()))
                .toList();
        if (analyses.isEmpty()) {
            throw new AnalysisException("no eligible repositories", AnalysisException.Phase.AGGREGATE);
        }

        profileReportService.aggregate(jobId, username, analyses,
                completedRepos.stream().map(repo -> repo.getPrimaryLanguage() != null ? repo.getPrimaryLanguage() : "").toList());
    }
}
