package pinnedsignal.global.config;

import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import java.time.Duration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import pinnedsignal.global.common.AnalysisConstants;

@Configuration
public class LlmClientConfig {

    // SDK가 연결 오류·429·5xx를 2회 재시도한다. 앱은 SDK 오류를 다시 시도하지 않는다.
    static final int SDK_MAX_RETRIES = 2;

    @Bean(destroyMethod = "close")
    public OpenAIClient openAiClient(LlmProperties properties) {
        return OpenAIOkHttpClient.builder()
                .baseUrl(properties.baseUrl())
                .apiKey(properties.apiKey())
                .timeout(Duration.ofMillis(AnalysisConstants.LLM_REQUEST_TIMEOUT_MS))
                .maxRetries(SDK_MAX_RETRIES)
                .build();
    }
}
