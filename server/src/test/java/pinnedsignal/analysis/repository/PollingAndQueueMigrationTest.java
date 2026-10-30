package pinnedsignal.analysis.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashMap;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

// 운영 DB처럼 V1까지 적용된 상태에 Node 앱이 남긴 행을 넣고 V2를 적용한다.
@Testcontainers
class PollingAndQueueMigrationTest {

    @Container
    private static final PostgreSQLContainer postgres =
            new PostgreSQLContainer("postgres:17-alpine").withUrlParam("currentSchema", "pinnedsignal");

    @Test
    void failsOlderActiveJobsOfSameProfileBeforeCreatingUniqueIndex() throws SQLException {
        migrate("1");
        try (Connection connection = connect(); Statement statement = connection.createStatement()) {
            statement.executeUpdate("""
                    INSERT INTO analysis_jobs (id, github_profile, status, created_at, updated_at) VALUES
                      ('old', 'https://github.com/a', 'PROCESSING', '2026-01-01 00:00:00', '2026-01-01 00:00:00'),
                      ('new', 'https://github.com/a', 'PENDING', '2026-01-02 00:00:00', '2026-01-02 00:00:00'),
                      ('done', 'https://github.com/a', 'COMPLETED', '2025-12-31 00:00:00', '2025-12-31 00:00:00'),
                      ('other', 'https://github.com/b', 'PROCESSING', '2026-01-01 00:00:00', '2026-01-01 00:00:00')
                    """);
        }

        migrate("latest");

        Map<String, String> statuses = new HashMap<>();
        String oldErrorMessage = null;
        try (Connection connection = connect(); Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery("SELECT id, status, error_message FROM analysis_jobs")) {
            while (rows.next()) {
                statuses.put(rows.getString("id"), rows.getString("status"));
                if (rows.getString("id").equals("old")) {
                    oldErrorMessage = rows.getString("error_message");
                }
            }
        }
        assertThat(statuses).containsExactlyInAnyOrderEntriesOf(Map.of(
                "old", "FAILED", "new", "PENDING", "done", "COMPLETED", "other", "PROCESSING"));
        assertThat(oldErrorMessage).isEqualTo("서버 재시작으로 분석이 중단되었습니다");
    }

    private static void migrate(String target) {
        Flyway.configure()
                .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .schemas("pinnedsignal")
                .target(target)
                .load()
                .migrate();
    }

    private static Connection connect() throws SQLException {
        return DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
    }
}
