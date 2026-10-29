package pinnedsignal.support;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import pinnedsignal.TestcontainersConfiguration;
import pinnedsignal.global.github.service.GitHubClient;
import pinnedsignal.global.llm.service.LlmClient;

// 전체 컨텍스트와 Testcontainers Postgres를 쓰는 테스트의 공통 설정. 컨텍스트를 공유하도록 설정을 한 곳에 둔다.
// 폴러는 끄고 테스트가 직접 poll()을 부른다. GitHub·LLM 호출은 가짜로 바꾼다.
@SpringBootTest(properties = {
        "github.token=test-token",
        "llm.base-url=http://localhost:1",
        "llm.api-key=test-key",
        "llm.model=test-model",
        "analysis.polling.enabled=false",
})
@Import(TestcontainersConfiguration.class)
public abstract class IntegrationTestBase {

    @MockitoBean
    protected GitHubClient gitHubClient;

    @MockitoBean
    protected LlmClient llmClient;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void cleanDatabase() {
        jdbcTemplate.execute("TRUNCATE profile_reports, repository_analyses, repositories, analysis_jobs CASCADE");
    }
}
