package pinnedsignal.global.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.DefaultUriBuilderFactory;
import pinnedsignal.global.common.AnalysisConstants;

@Configuration
public class RestClientConfig {

    @Bean
    public RestClient gitHubRestClient(RestClient.Builder builder, GitHubProperties properties) {
        return gitHubRestClient(builder, properties.apiBaseUrl(), properties.token());
    }

    // 경로와 쿼리는 GitHubClient가 직접 인코딩하므로 다시 인코딩하지 않는다.
    public static RestClient gitHubRestClient(RestClient.Builder builder, String baseUrl, String token) {
        DefaultUriBuilderFactory uriBuilderFactory = new DefaultUriBuilderFactory(baseUrl);
        uriBuilderFactory.setEncodingMode(DefaultUriBuilderFactory.EncodingMode.NONE);
        return builder
                .uriBuilderFactory(uriBuilderFactory)
                .defaultHeader("Authorization", "Bearer " + token)
                .defaultHeader("Accept", "application/vnd.github+json")
                .defaultHeader("X-GitHub-Api-Version", AnalysisConstants.GITHUB_API_VERSION)
                .build();
    }
}
