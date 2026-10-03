package com.maxsolch.shop.security;

import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Authenticates a request from {@code Authorization: Bearer <jwt>} (Mini App, admin) or, when there
 * is no such header, from the {@code access} cookie (public site). Populates the SecurityContext
 * with an {@link AuthPrincipal} and a single authority ({@code ROLE_CUSTOMER} or {@code ROLE_ADMIN}).
 *
 * <ul>
 *   <li>ADMIN tokens are re-checked against {@link AdminTokenValidator} (revocation).</li>
 *   <li>Site tokens ({@code chn=web}) need a live {@code web_sessions} row ({@link WebSessionValidator}).</li>
 *   <li>Cookie-authenticated state-changing requests must come from an allowed Origin/Referer,
 *       otherwise 403 ({@link CookieOriginGuard}) — the browser attaches the cookie by itself.</li>
 * </ul>
 */
@Slf4j
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final AdminTokenValidator adminTokenValidator;
    private final WebSessionValidator webSessionValidator;
    private final CookieOriginGuard originGuard;

    public JwtAuthFilter(JwtService jwtService,
                         AdminTokenValidator adminTokenValidator,
                         WebSessionValidator webSessionValidator,
                         CookieOriginGuard originGuard) {
        this.jwtService = jwtService;
        this.adminTokenValidator = adminTokenValidator;
        this.webSessionValidator = webSessionValidator;
        this.originGuard = originGuard;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain)
            throws ServletException, IOException {

        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            String token;
            boolean fromCookie = false;
            String header = request.getHeader("Authorization");
            if (header != null && header.startsWith(BEARER_PREFIX)) {
                token = header.substring(BEARER_PREFIX.length()).trim();
            } else {
                token = WebCookies.read(request, WebCookies.ACCESS);
                fromCookie = token != null;
            }
            if (token != null && !token.isEmpty()) {
                AuthPrincipal principal = parse(token);
                if (principal != null) {
                    if (fromCookie && CookieOriginGuard.isMutating(request)
                            && !originGuard.isTrustedOrigin(request)) {
                        log.warn("Cookie-auth {} {} refused: untrusted origin {} / referer {}",
                                request.getMethod(), request.getRequestURI(),
                                request.getHeader("Origin"), request.getHeader("Referer"));
                        forbid(response);
                        return;
                    }
                    var authorities = List.of(new SimpleGrantedAuthority(principal.role().authority()));
                    var authentication = new UsernamePasswordAuthenticationToken(principal, null, authorities);
                    authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                }
            }
        }
        filterChain.doFilter(request, response);
    }

    /** Valid, non-revoked principal, or null (the request then simply stays anonymous). */
    private AuthPrincipal parse(String token) {
        try {
            AuthPrincipal principal = jwtService.parse(token);
            // Stateless tokens live for weeks — re-check that an ADMIN token has not been
            // revoked (deactivated account / password change bumps token_version).
            if (!adminTokenValidator.isValid(principal)) {
                log.debug("Rejected revoked admin token for {}", principal.telegramUserId());
                return null;
            }
            if (!webSessionValidator.isValid(principal)) {
                log.debug("Rejected site token of an ended session {}", principal.sessionId());
                return null;
            }
            return principal;
        } catch (JwtException | IllegalArgumentException e) {
            log.debug("Rejected JWT: {}", e.getMessage());
            return null;
        }
    }

    private static void forbid(HttpServletResponse response) throws IOException {
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write("{\"status\":403,\"error\":\"Forbidden\",\"message\":\"origin not allowed\"}");
    }
}
