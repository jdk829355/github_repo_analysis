package pinnedsignal.global.config;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "github")
public record GitHubProperties(@NotBlank(message = "GITHUB_TOKEN environment variable is not set") String token) {
}
