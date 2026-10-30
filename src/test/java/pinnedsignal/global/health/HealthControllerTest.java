package pinnedsignal.global.health;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(HealthController.class)
class HealthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private HealthCheckService healthCheckService;

    @Test
    void returns200WhenEveryCheckPasses() throws Exception {
        when(healthCheckService.check())
                .thenReturn(new HealthResponse("ok", Map.of("database", "ok", "poller", "ok")));

        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.checks.database").value("ok"))
                .andExpect(jsonPath("$.checks.poller").value("ok"));
    }

    @Test
    void returns503WhenAnyCheckFails() throws Exception {
        when(healthCheckService.check())
                .thenReturn(new HealthResponse("fail", Map.of("database", "ok", "poller", "fail")));

        mockMvc.perform(get("/api/health"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.status").value("fail"))
                .andExpect(jsonPath("$.checks.poller").value("fail"));
    }
}
