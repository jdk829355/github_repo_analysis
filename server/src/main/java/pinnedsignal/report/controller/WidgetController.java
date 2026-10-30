package pinnedsignal.report.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pinnedsignal.report.service.WidgetService;
import pinnedsignal.report.service.WidgetSvgRenderer.Theme;

/**
 * GitHub README에 붙은 위젯 주소라서 경로, theme 파라미터, 응답 형식, Cache-Control을 Node 앱과 같게 유지한다.
 * Tomcat이 Content-Type의 {@code ;} 뒤 공백을 지우므로 헤더 문자열이 바이트까지 같지는 않지만 미디어 타입은 같다.
 */
@RestController
@RequiredArgsConstructor
public class WidgetController {

    private final WidgetService widgetService;

    @GetMapping("/api/widget/{jobId}")
    public ResponseEntity<String> widget(@PathVariable String jobId,
            @RequestParam(required = false) String theme) {
        Theme requested = "dark".equals(theme) ? Theme.DARK : Theme.LIGHT;
        return widgetService.findSvg(jobId, requested)
                .map(svg -> ResponseEntity.ok()
                        .header(HttpHeaders.CONTENT_TYPE, "image/svg+xml; charset=utf-8")
                        .header(HttpHeaders.CACHE_CONTROL, "public, max-age=300, stale-while-revalidate=86400")
                        .body(svg))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .header(HttpHeaders.CONTENT_TYPE, "text/plain; charset=utf-8")
                        .body("Widget not found"));
    }
}
