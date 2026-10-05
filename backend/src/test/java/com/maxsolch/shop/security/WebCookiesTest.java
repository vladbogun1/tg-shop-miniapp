package com.maxsolch.shop.security;

import com.maxsolch.shop.config.AppProperties;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** The script-readable {@code signed_in} flag travels with the refresh cookie. */
class WebCookiesTest {

    private final WebCookies cookies = new WebCookies(new AppProperties.Site(), true);

    private static String header(List<String> headers, String name) {
        return headers.stream().filter(h -> h.startsWith(name + "=")).findFirst().orElseThrow();
    }

    @Test
    void refreshSetsReadableSessionHint() {
        MockHttpServletResponse res = new MockHttpServletResponse();
        cookies.setRefresh(res, "opaque");

        List<String> set = res.getHeaders(HttpHeaders.SET_COOKIE);
        String refresh = header(set, WebCookies.REFRESH);
        String hint = header(set, WebCookies.SESSION_HINT);

        assertThat(refresh).contains("HttpOnly").contains("Path=/api/auth/web");
        assertThat(hint)
                .startsWith("signed_in=1;")
                .contains("Path=/")
                .contains("Max-Age=" + 30 * 24 * 3600)
                .contains("Secure")
                .contains("SameSite=Lax")
                .doesNotContain("HttpOnly");
    }

    @Test
    void clearSessionClearsSessionHint() {
        MockHttpServletResponse res = new MockHttpServletResponse();
        cookies.clearSession(res);

        String hint = header(res.getHeaders(HttpHeaders.SET_COOKIE), WebCookies.SESSION_HINT);
        assertThat(hint).startsWith("signed_in=;").contains("Max-Age=0").contains("Path=/");
    }

    @Test
    void accessCookieAloneDoesNotTouchHint() {
        MockHttpServletResponse res = new MockHttpServletResponse();
        cookies.setAccess(res, "jwt");

        assertThat(res.getHeaders(HttpHeaders.SET_COOKIE))
                .noneMatch(h -> h.startsWith(WebCookies.SESSION_HINT + "="));
    }
}
