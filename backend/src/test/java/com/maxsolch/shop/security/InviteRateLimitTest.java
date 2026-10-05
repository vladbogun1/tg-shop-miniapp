package com.maxsolch.shop.security;

import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.i18n.Messages;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/** /api/auth/admin/invite/* has its own per-IP bucket (guessing invite tokens), apart from sign-in. */
class InviteRateLimitTest {

    private static int call(RateLimitFilter filter, String path, String ip) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", path);
        req.setRemoteAddr(ip);
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(req, res, new MockFilterChain());
        return res.getStatus();
    }

    @Test
    void invitePageIsThrottledPerIp() throws Exception {
        AppProperties props = new AppProperties();
        props.getSecurity().setAdminAuthRateLimit(1000);
        RateLimitFilter filter = new RateLimitFilter(mock(Messages.class), props);
        for (int i = 0; i < 30; i++) {
            assertThat(call(filter, "/api/auth/admin/invite/check", "203.0.113.7")).isEqualTo(200);
        }
        assertThat(call(filter, "/api/auth/admin/invite/accept", "203.0.113.7")).isEqualTo(429);
        // Another address and the regular sign-in are not affected.
        assertThat(call(filter, "/api/auth/admin/invite/check", "203.0.113.8")).isEqualTo(200);
        assertThat(call(filter, "/api/auth/admin/login", "203.0.113.7")).isEqualTo(200);
    }
}
