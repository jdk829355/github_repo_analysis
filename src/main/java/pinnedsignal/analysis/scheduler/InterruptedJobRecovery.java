package pinnedsignal.analysis.scheduler;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.stereotype.Component;
import pinnedsignal.analysis.service.AnalysisQueueService;

// 폴러가 돌기 전에 끝나야 한다. 스케줄러는 컨텍스트 초기화가 끝난 뒤에 시작하므로 이 시점이 먼저다.
@Component
@RequiredArgsConstructor
public class InterruptedJobRecovery implements SmartInitializingSingleton {

    private final AnalysisQueueService queueService;

    @Override
    public void afterSingletonsInstantiated() {
        queueService.failInterruptedJobs();
    }
}
