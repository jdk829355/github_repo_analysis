package pinnedsignal.global.config;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

// apiBaseUrl은 테스트에서 WireMock 주소로 바꾸려고 둔다.
@Validated
@ConfigurationProperties(prefix = "github")
public record GitHubProperties(
        @NotBlank(message = "GITHUB_TOKEN environment variable is not set") String token,
        @DefaultValue("https://api.github.com") String apiBaseUrl) {
}
