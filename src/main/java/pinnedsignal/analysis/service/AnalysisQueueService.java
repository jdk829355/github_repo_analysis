package pinnedsignal.analysis.service;

import java.time.Instant;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pinnedsignal.analysis.enums.AnalysisJobStatus;
import pinnedsignal.analysis.repository.AnalysisJobRepository;

// Redis 대신 analysis_jobs 테이블이 작업 큐다. PENDING 행이 대기 중인 작업이다.
@Slf4j
@Service
@RequiredArgsConstructor
public class AnalysisQueueService {

    static final String INTERRUPTED_MESSAGE = "서버 재시작으로 분석이 중단되었습니다";

    private final AnalysisJobRepository analysisJobRepository;

    @Transactional
    public Optional<ClaimedJob> claimNext() {
        return analysisJobRepository.claimNextPending()
                .flatMap(analysisJobRepository::findById)
                .map(job -> new ClaimedJob(job.getId(), job.getGithubProfile()));
    }

    // 서버는 한 대라서 앱이 뜰 때 PROCESSING인 작업은 이전 프로세스가 남긴 것이다.
    @Transactional
    public int failInterruptedJobs() {
        int count = analysisJobRepository.updateStatus(
                AnalysisJobStatus.PROCESSING, AnalysisJobStatus.FAILED, INTERRUPTED_MESSAGE, Instant.now());
        if (count > 0) {
            log.atWarn()
                    .addKeyValue("event", "job.interrupted")
                    .addKeyValue("count", count)
                    .log("marked interrupted analysis jobs as failed");
        }
        return count;
    }
}
