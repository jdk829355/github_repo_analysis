package pinnedsignal.global.util;

import jakarta.servlet.http.HttpServletResponse;

public final class HtmxResponses {

    // htmx는 286을 받으면 polling을 멈춘다.
    public static final int STOP_POLLING = 286;

    private HtmxResponses() {
    }

    /** 화면 조각 요청에 대한 응답으로 브라우저 전체를 다른 주소로 보낸다. */
    public static void redirect(HttpServletResponse response, String url) {
        response.setHeader("HX-Redirect", url);
    }
}
