package com.maxsolch.shop.adminauth;

import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.security.AdminTokenValidator;
import com.maxsolch.shop.security.CookieOriginGuard;
import com.maxsolch.shop.security.JwtAuthFilter;
import com.maxsolch.shop.security.JwtService;
import com.maxsolch.shop.security.WebSessionValidator;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * The pre-auth token (first factor passed, 2FA not yet) must never open the admin API: it is signed
 * with another key, so it is not an access token, and the filter answers 403 when it is tried as one.
 */
class PreAuthTokenFilterTest {

    private static final String JWT_SECRET = "ZTJlLW9ubHktand0LXNlY3JldC1ub3QtZm9yLXByb2R1Y3Rpb24tdXNlLTAwMDAwMDA=";

    MutableClock clock;
    PreAuthTokens preAuth;
    JwtService jwtService;
    JwtAuthFilter filter;
    FilterChain chain;

    @BeforeEach
    void setUp() {
        AppProperties props = new AppProperties();
        props.getSecurity().setJwtSecret(JWT_SECRET);
        AdminAuthKeys keys = new AdminAuthKeys(props);
        clock = new MutableClock(Instant.now());
        preAuth = new PreAuthTokens(keys.preAuthKey(), clock);
        jwtService = new JwtService(props);
        filter = new JwtAuthFilter(jwtService, mock(AdminTokenValidator.class), mock(WebSessionValidator.class),
                mock(CookieOriginGuard.class), preAuth);
        chain = mock(FilterChain.class);
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private MockHttpServletRequest bearer(String method, String uri, String token) {
        MockHttpServletRequest r = new MockHttpServletRequest(method, uri);
        r.addHeader("Authorization", "Bearer " + token);
        return r;
    }

    @Test
    void preAuthTokenIsNotAnAccessToken() {
        String token = preAuth.issue(7L, 3, LoginMethod.PASSWORD, PreAuthTokens.Stage.VERIFY);
        assertThatThrownBy(() -> jwtService.parse(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void preAuthTokenOnTheAdminApiIs403_andNeverReachesTheController() throws Exception {
        String token = preAuth.issue(7L, 3, LoginMethod.PASSWORD, PreAuthTokens.Stage.SETUP);
        for (String uri : new String[]{"/api/admin/orders/board", "/api/admin/account", "/api/me/orders",
                "/actuator/metrics", "/api/orders"}) {
            MockHttpServletResponse res = new MockHttpServletResponse();
            filter.doFilter(bearer("GET", uri, token), res, chain);
            assertThat(res.getStatus()).as(uri).isEqualTo(403);
            assertThat(res.getContentAsString()).contains("TWO_FACTOR_REQUIRED");
            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        }
        verify(chain, never()).doFilter(any(), any());
    }

    @Test
    void onTheSignInEndpointsItPassesThroughUnauthenticated() throws Exception {
        String token = preAuth.issue(7L, 3, LoginMethod.TELEGRAM, PreAuthTokens.Stage.VERIFY);
        MockHttpServletRequest req = bearer("POST", "/api/auth/admin/2fa/verify", token);
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(req, res, chain);
        verify(chain).doFilter(req, res);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void expiredAndUsedTokensAreRefused_butStillRecognisedAs403() throws Exception {
        String token = preAuth.issue(7L, 3, LoginMethod.PASSWORD, PreAuthTokens.Stage.VERIFY);
        PreAuthTokens.PreAuth parsed = preAuth.parse(token).orElseThrow();
        assertThat(parsed.adminId()).isEqualTo(7L);
        assertThat(parsed.tokenVersion()).isEqualTo(3);
        assertThat(parsed.method()).isEqualTo(LoginMethod.PASSWORD);

        preAuth.consume(parsed);
        assertThat(preAuth.parse(token)).as("single use").isEmpty();

        String other = preAuth.issue(7L, 3, LoginMethod.PASSWORD, PreAuthTokens.Stage.VERIFY);
        clock.advance(Duration.ofMinutes(PreAuthTokens.TTL_MINUTES).plusSeconds(1));
        assertThat(preAuth.parse(other)).as("expired").isEmpty();

        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(bearer("GET", "/api/admin/orders/board", other), res, chain);
        assertThat(res.getStatus()).isEqualTo(403);
    }

    @Test
    void accessTokenIsNotAPreAuthToken() {
        String access = jwtService.issueToken(7L, com.maxsolch.shop.security.Role.ADMIN, 3);
        assertThat(preAuth.parse(access)).isEmpty();
        assertThat(preAuth.looksLikePreAuth(access)).isFalse();
    }
}
