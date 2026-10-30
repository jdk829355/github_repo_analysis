package pinnedsignal.report.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import pinnedsignal.report.service.WidgetSvgRenderer.Theme;
import pinnedsignal.report.service.WidgetSvgRenderer.WidgetReport;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * resources/golden/widget의 SVG는 Node 앱의 renderWidgetSvg가 같은 입력(cases.json)으로 만든 출력이다.
 * 위젯은 README에 붙어 있으므로 바이트 단위로 같아야 한다. 입력을 고치면 services/widget-export.ts로 다시 만든다.
 */
class WidgetSvgRendererTest {

    private record Case(String name, WidgetReport report) {

        @Override
        public String toString() {
            return name;
        }
    }

    private static String resource(String name) throws IOException {
        try (InputStream in = WidgetSvgRendererTest.class.getResourceAsStream("/golden/widget/" + name)) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    static Stream<Case> cases() throws IOException {
        List<Case> cases = JsonMapper.builder().build().readValue(resource("cases.json"), new TypeReference<>() {
        });
        return cases.stream();
    }

    @ParameterizedTest
    @MethodSource("cases")
    void matchesSvgFromNodeImplementation(Case testCase) throws IOException {
        assertThat(WidgetSvgRenderer.render(testCase.report(), Theme.LIGHT))
                .isEqualTo(resource(testCase.name() + ".light.svg"));
        assertThat(WidgetSvgRenderer.render(testCase.report(), Theme.DARK))
                .isEqualTo(resource(testCase.name() + ".dark.svg"));
    }

    @Test
    void rendersAtReducedDisplaySizeKeepingOriginalCoordinateSpace() throws IOException {
        Case typical = cases().findFirst().orElseThrow();

        WidgetSvgRenderer.Variants variants = WidgetSvgRenderer.renderVariants(typical.report());

        assertThat(variants.light()).contains("<svg width=\"613\" height=\"431\" viewBox=\"0 0 876 616\"");
        assertThat(variants.light()).contains("data-widget-version=\"" + WidgetSvgRenderer.VERSION + "\"");
        assertThat(variants.dark()).isNotEqualTo(variants.light());
    }
}
