package pinnedsignal.report.controller;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import pinnedsignal.report.service.WidgetService;
import pinnedsignal.report.service.WidgetSvgRenderer.Theme;

// README에 붙은 위젯 주소라서 응답 헤더까지 Node 앱과 같아야 한다.
@WebMvcTest(WidgetController.class)
class WidgetControllerTest {

    private static final String SVG = "<svg data-widget-version=\"inner-card-v4\"></svg>";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private WidgetService widgetService;

    @Test
    void returnsSvgWithTheSameHeadersAsTheNodeApp() throws Exception {
        when(widgetService.findSvg("job-1", Theme.LIGHT)).thenReturn(Optional.of(SVG));

        mockMvc.perform(get("/api/widget/job-1"))
                .andExpect(status().isOk())
                .andExpect(content().contentType("image/svg+xml;charset=utf-8"))
                .andExpect(header().string("Cache-Control", "public, max-age=300, stale-while-revalidate=86400"))
                .andExpect(content().string(SVG));
    }

    @Test
    void themeParameterPicksTheDarkVariant() throws Exception {
        when(widgetService.findSvg("job-1", Theme.DARK)).thenReturn(Optional.of("<svg>dark</svg>"));

        mockMvc.perform(get("/api/widget/job-1").param("theme", "dark"))
                .andExpect(status().isOk())
                .andExpect(content().string("<svg>dark</svg>"));
    }

    @Test
    void unknownThemeFallsBackToLight() throws Exception {
        when(widgetService.findSvg("job-1", Theme.LIGHT)).thenReturn(Optional.of(SVG));

        mockMvc.perform(get("/api/widget/job-1").param("theme", "solarized"))
                .andExpect(status().isOk());

        verify(widgetService).findSvg("job-1", Theme.LIGHT);
    }

    @Test
    void answersEvenWhenTheClientOnlyAcceptsImages() throws Exception {
        when(widgetService.findSvg("job-1", Theme.LIGHT)).thenReturn(Optional.of(SVG));

        mockMvc.perform(get("/api/widget/job-1").accept("image/avif,image/webp,image/*,*/*;q=0.8"))
                .andExpect(status().isOk())
                .andExpect(content().contentType("image/svg+xml;charset=utf-8"));
    }

    @Test
    void returnsPlainText404WhenThereIsNoWidget() throws Exception {
        when(widgetService.findSvg("missing", Theme.LIGHT)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/widget/missing"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentType("text/plain;charset=utf-8"))
                .andExpect(content().string("Widget not found"));
    }
}
