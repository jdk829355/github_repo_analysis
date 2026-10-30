package pinnedsignal;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;

// 운영 DB(Supabase)와 같은 Postgres 17. 빈 DB라서 Flyway가 V1부터 실행한다.
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgres() {
        return new PostgreSQLContainer("postgres:17-alpine").withUrlParam("currentSchema", "pinnedsignal");
    }
}
