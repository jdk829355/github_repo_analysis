package pinnedsignal.analysis.service;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import pinnedsignal.analysis.entity.AnalysisJob;
import pinnedsignal.analysis.enums.AnalysisJobStatus;
import pinnedsignal.analysis.exception.StarRequiredException;
import pinnedsignal.analysis.repository.AnalysisJobRepository;
import pinnedsignal.global.common.AnalysisConstants;
import pinnedsignal.global.github.service.GitHubClient;
import pinnedsignal.global.util.GitHubUrls;

/**
 * app/api/analyze/route.ts를 옮긴 것. URL 검증 → 프로필 존재 확인 → star 확인 → 작업 생성 순서다.
 * GitHub를 부르는 동안 트랜잭션을 잡지 않으려고 메서드에는 @Transactional을 걸지 않는다.
 */
@Service
@RequiredArgsConstructor
public class AnalysisRequestService {

    private static final List<AnalysisJobStatus> ACTIVE_STATUSES =
            List.of(AnalysisJobStatus.PENDING, AnalysisJobStatus.PROCESSING);

    private final GitHubClient gitHubClient;
    private final AnalysisJobRepository analysisJobRepository;

    /**
     * @return 새로 만든 작업, 또는 같은 프로필에서 이미 진행 중인 작업의 id
     * @throws StarRequiredException 검증용 저장소에 star가 없을 때
     */
    public String requestAnalysis(String rawUrl) {
        String githubProfile = GitHubUrls.normalize(rawUrl);
        String username = GitHubUrls.usernameOf(githubProfile);

        gitHubClient.getUserProfile(username);
        boolean starred = gitHubClient.hasUserStarredRepository(
                username, AnalysisConstants.VERIFICATION_REPO_OWNER, AnalysisConstants.VERIFICATION_REPO_NAME);
        if (!starred) {
            throw new StarRequiredException(username);
        }

        return createOrFindActiveJob(githubProfile);
    }

    // 큐 등록이 곧 PENDING 행 INSERT다. 진행 중인 작업이 있으면 partial unique index가 막으므로 그 작업을 돌려준다.
    private String createOrFindActiveJob(String githubProfile) {
        try {
            return analysisJobRepository.saveAndFlush(AnalysisJob.pending(githubProfile)).getId();
        } catch (DataIntegrityViolationException e) {
            return analysisJobRepository
                    .findFirstByGithubProfileAndStatusInOrderByCreatedAtDesc(githubProfile, ACTIVE_STATUSES)
                    .map(AnalysisJob::getId)
                    // 찾지 못하면 INSERT와 조회 사이에 그 작업이 끝난 것이다. 원래 예외를 올리고 사용자는 다시 요청하면 된다.
                    .orElseThrow(() -> e);
        }
    }
}
