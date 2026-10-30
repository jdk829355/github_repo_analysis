package pinnedsignal.global.llm.prompt;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import pinnedsignal.global.llm.dto.ProfileAggregationInput;
import pinnedsignal.global.llm.dto.RepositoryAnalysisInput;
import pinnedsignal.global.llm.dto.RepositoryAnalysisResponse;

/**
 * test/resources/golden/prompts/*.txt는 Node 앱의 prompts/*.ts가 같은 입력으로 만든 출력이다.
 * Java 렌더링 결과가 이 파일과 한 글자라도 다르면 실패한다.
 */
class PromptGoldenTest {

    private static String golden(String name) throws IOException {
        return new ClassPathResource("golden/prompts/" + name).getContentAsString(StandardCharsets.UTF_8);
    }

    @Test
    void repositoryPromptWithAllFieldsMatchesNode() throws IOException {
        RepositoryAnalysisInput input = new RepositoryAnalysisInput(
                "pinned-signal", "GitHub 프로필 분석기", "TypeScript", 0, 3,
                "# Pinned Signal\n\nREADME 본문 `code`와 ${not_a_template} 그리고 $1 백슬래시 \\ 포함",
                List.of(
                        new RepositoryAnalysisInput.CommitLog("feat: 분석 파이프라인 추가", "2026-01-02T03:04:05Z", "octocat"),
                        new RepositoryAnalysisInput.CommitLog("fix: SSE 재연결\n\n본문 둘째 줄", "2026-01-03T00:00:00Z",
                                "unknown")));

        assertThat(new RepositoryAnalysisPrompt().render(input)).isEqualTo(golden("repository-analysis-full.txt"));
    }

    @Test
    void repositoryPromptWithoutOptionalFieldsMatchesNode() throws IOException {
        RepositoryAnalysisInput input = new RepositoryAnalysisInput("empty", "", null, null, null, "", List.of());

        assertThat(new RepositoryAnalysisPrompt().render(input)).isEqualTo(golden("repository-analysis-minimal.txt"));
    }

    @Test
    void profilePromptMatchesNode() throws IOException {
        ProfileAggregationInput input = new ProfileAggregationInput("octocat", List.of(
                new RepositoryAnalysisResponse("pinned-signal", "이 저장소에서 사용자는 백엔드 API와 큐 처리를 주로 맡았습니다. ".repeat(8),
                        "web-app", List.of("Backend", "DevOps"), List.of("분석 파이프라인", "SSE"),
                        List.of("Next.js", "BullMQ"), List.of(), 0.85),
                new RepositoryAnalysisResponse("cli", "짧은 요약", "CLI tool", List.of(), List.of(), List.of("Go"),
                        List.of("코드 리뷰 주도"), 1.0)));

        assertThat(new ProfileAggregationPrompt().render(input)).isEqualTo(golden("profile-aggregation.txt"));
    }
}
