package pinnedsignal.global.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

// 애플리케이션 클래스가 아니라 여기서 켠다. @WebMvcTest 같은 슬라이스 테스트는 이 설정을 읽지 않으므로 환경 변수 없이 돈다.
@Configuration
@EnableConfigurationProperties({GitHubProperties.class, LlmProperties.class})
public class PropertiesConfig {
}
