package pinnedsignal.global.common;

import java.util.concurrent.CancellationException;
import org.springframework.stereotype.Component;

@Component
public class ThreadSleeper implements Sleeper {

    // 대기 중에 인터럽트되면(분석 타임아웃 등) 플래그를 되살리고 작업을 멈춘다.
    @Override
    public void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new CancellationException("interrupted while waiting to retry");
        }
    }
}
