package com.maxsolch.shop.security;

import com.maxsolch.shop.config.AllowedOrigins;
import com.maxsolch.shop.config.AppProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * A cookie is sent by the browser on its own, so a state-changing request authenticated by the
 * {@code access} cookie must come from an allowed Origin/Referer. Bearer auth is unaffected.
 */
@ExtendWith(MockitoExtension.class)
class CookieAuthOriginTest {

    private static final String SITE = "https://maxsolkh.shop";
    private static final AuthPrincipal WEB_USER =
            new AuthPrincipal(42L, Role.CUSTOMER, 0, AuthPrincipal.CHANNEL_WEB, "sid-1");

    @Mock
    JwtService jwtService;
    @Mock
    AdminTokenValidator adminTokenValidator;
    @Mock
    WebSessionValidator webSessionValidator;
    @Mock
    com.maxsolch.shop.adminauth.PreAuthTokens preAuthTokens;
    @Mock
    FilterChain chain;

    CookieOriginGuard guard;
    JwtAuthFilter filter;

    @BeforeEach
    void setUp() {
        AppProperties props = new AppProperties();
        props.setWebappBaseUrl("https://maxsolkh.shop:666");
        props.setAdminBaseUrl("https://maxsolkh.shop:667");
        props.getSite().setBaseUrl(SITE + "/"); // trailing slash must not matter
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("prod");
        guard = new CookieOriginGuard(new AllowedOrigins(props, env));
        filter = new JwtAuthFilter(jwtService, adminTokenValidator, webSessionValidator, guard, preAuthTokens);

        lenient().when(jwtService.parse(anyString())).thenReturn(WEB_USER);
        lenient().when(adminTokenValidator.isValid(any())).thenReturn(true);
        lenient().when(webSessionValidator.isValid(any())).thenReturn(true);
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    // ---------------------------------------------------------------- guard

    @Test
    void siteAndAppOriginsAreTrusted() {
        assertThat(guard.isTrustedOrigin(request("POST", SITE, null))).isTrue();
        assertThat(guard.isTrustedOrigin(request("POST", "https://maxsolkh.shop:666", null))).isTrue();
        assertThat(guard.isTrustedOrigin(request("POST", null, SITE + "/checkout?step=2"))).isTrue();
    }

    @Test
    void foreignMissingOrLookalikeOriginsAreNot() {
        assertThat(guard.isTrustedOrigin(request("POST", "https://evil.example", null))).isFalse();
        assertThat(guard.isTrustedOrigin(request("POST", "https://maxsolkh.shop.evil.example", null))).isFalse();
        assertThat(guard.isTrustedOrigin(request("POST", "http://maxsolkh.shop", null))).isFalse();
        assertThat(guard.isTrustedOrigin(request("POST", "null", null))).isFalse();
        assertThat(guard.isTrustedOrigin(request("POST", null, "https://evil.example/" + SITE))).isFalse();
        assertThat(guard.isTrustedOrigin(request("POST", null, null))).isFalse();
    }

    @Test
    void devWildcardsOnlyUnderDevProfile() {
        MockEnvironment dev = new MockEnvironment();
        dev.setActiveProfiles("dev");
        CookieOriginGuard devGuard = new CookieOriginGuard(new AllowedOrigins(new AppProperties(), dev));

        assertThat(devGuard.isTrustedOrigin(request("POST", "http://localhost:3006", null))).isTrue();
        assertThat(guard.isTrustedOrigin(request("POST", "http://localhost:3006", null))).isFalse();
    }

    // ---------------------------------------------------------------- filter

    @Test
    void cookieAuthPostFromForeignOriginIs403() throws Exception {
        MockHttpServletRequest req = request("POST", "https://evil.example", null);
        req.setCookies(new Cookie(WebCookies.ACCESS, "jwt"));
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, chain);

        assertThat(res.getStatus()).isEqualTo(403);
        verify(chain, never()).doFilter(any(), any());
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void cookieAuthPostWithoutOriginIs403() throws Exception {
        MockHttpServletRequest req = request("DELETE", null, null);
        req.setCookies(new Cookie(WebCookies.ACCESS, "jwt"));
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, chain);

        assertThat(res.getStatus()).isEqualTo(403);
    }

    @Test
    void cookieAuthPostFromTheSiteAuthenticates() throws Exception {
        MockHttpServletRequest req = request("POST", SITE, null);
        req.setCookies(new Cookie(WebCookies.ACCESS, "jwt"));
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, chain);

        verify(chain).doFilter(req, res);
        assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal()).isEqualTo(WEB_USER);
    }

    @Test
    void cookieAuthGetNeedsNoOrigin() throws Exception {
        MockHttpServletRequest req = request("GET", null, null);
        req.setCookies(new Cookie(WebCookies.ACCESS, "jwt"));
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, chain);

        verify(chain).doFilter(req, res);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
    }

    @Test
    void bearerAuthIsNotOriginChecked() throws Exception {
        when(jwtService.parse("mini-app-jwt")).thenReturn(new AuthPrincipal(42L, Role.CUSTOMER));
        MockHttpServletRequest req = request("POST", "https://evil.example", null);
        req.addHeader("Authorization", "Bearer mini-app-jwt");
        req.setCookies(new Cookie(WebCookies.ACCESS, "jwt"));
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, chain);

        verify(chain).doFilter(req, res);
        assertThat(((AuthPrincipal) SecurityContextHolder.getContext().getAuthentication().getPrincipal()).isWeb())
                .as("the header wins over the cookie").isFalse();
    }

    @Test
    void endedSiteSessionLeavesTheRequestAnonymous() throws Exception {
        when(webSessionValidator.isValid(any())).thenReturn(false);
        MockHttpServletRequest req = request("POST", SITE, null);
        req.setCookies(new Cookie(WebCookies.ACCESS, "jwt"));
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, chain);

        verify(chain).doFilter(req, res);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    private static MockHttpServletRequest request(String method, String origin, String referer) {
        MockHttpServletRequest req = new MockHttpServletRequest(method, "/api/me/locale");
        if (origin != null) {
            req.addHeader("Origin", origin);
        }
        if (referer != null) {
            req.addHeader("Referer", referer);
        }
        return req;
    }
}
