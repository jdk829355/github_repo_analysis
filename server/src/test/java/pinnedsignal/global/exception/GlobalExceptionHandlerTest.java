package pinnedsignal.global.exception;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import pinnedsignal.report.controller.ReportController;
import pinnedsignal.report.service.ReportQueryService;
import pinnedsignal.support.LogCapture;

@WebMvcTest(ReportController.class)
class GlobalExceptionHandlerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ReportQueryService reportQueryService;

    @Test
    void notFoundRendersThe404PageWithoutInternalDetails() throws Exception {
        when(reportQueryService.getReport(anyString())).thenThrow(new NotFoundException("report not found: secret-id"));

        mockMvc.perform(get("/report/x"))
                .andExpect(status().isNotFound())
                .andExpect(content().string(containsString("Page Not Found")))
                .andExpect(content().string(not(containsString("secret-id"))));
    }

    @Test
    void unexpectedErrorRendersThe5xxPageAndLogsTheCause() throws Exception {
        when(reportQueryService.getReport(anyString())).thenThrow(new IllegalStateException("db password is hunter2"));

        try (LogCapture logs = LogCapture.of(GlobalExceptionHandler.class)) {
            mockMvc.perform(get("/report/x"))
                    .andExpect(status().isInternalServerError())
                    .andExpect(content().string(containsString("Something Went Wrong")))
                    .andExpect(content().string(not(containsString("hunter2"))));

            assertThat(logs.events("api.error")).singleElement().satisfies(event -> {
                assertThat(event).containsEntry("route", "/report/x").containsEntry("status", 500);
                assertThat(event).containsEntry("level", "ERROR");
            });
        }
    }

    @Test
    void requestErrorsKeepTheirOwnStatusCode() throws Exception {
        try (LogCapture logs = LogCapture.of(GlobalExceptionHandler.class)) {
            mockMvc.perform(post("/report/x")).andExpect(status().isMethodNotAllowed());
            mockMvc.perform(get("/no-such-page")).andExpect(status().isNotFound());

            assertThat(logs.events("api.error")).isEmpty();
        }
    }
}
