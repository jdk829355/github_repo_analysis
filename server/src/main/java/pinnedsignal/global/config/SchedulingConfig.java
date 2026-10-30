package pinnedsignal.global.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

// 컨텍스트 전체를 띄우는 테스트는 analysis.polling.enabled=false로 폴러를 끈다.
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "analysis.polling.enabled", havingValue = "true", matchIfMissing = true)
public class SchedulingConfig {
}
