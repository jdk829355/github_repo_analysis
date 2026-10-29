package pinnedsignal;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

// 전체 컨텍스트가 뜨는지 본다. Flyway V1 → V2 적용 후 ddl-auto=validate로 엔티티와 스키마가 맞는지까지 확인된다.
@SpringBootTest(properties = {
        "github.token=test-token",
        "llm.base-url=http://localhost:1",
        "llm.api-key=test-key",
        "llm.model=test-model",
})
@Import(TestcontainersConfiguration.class)
class PinnedSignalApplicationTest {

    @Autowired
    private EntityManager entityManager;

    @Test
    void appliesBothMigrations() {
        Object versions = entityManager
                .createNativeQuery("SELECT string_agg(version, ',' ORDER BY installed_rank) FROM flyway_schema_history")
                .getSingleResult();

        assertThat(versions).isEqualTo("1,2");
    }
}
