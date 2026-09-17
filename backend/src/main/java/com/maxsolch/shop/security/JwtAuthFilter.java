package com.maxsolch.shop.security;

import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
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
 * Parses {@code Authorization: Bearer <jwt>} and populates the SecurityContext with an
 * {@link AuthPrincipal} and a single authority ({@code ROLE_CUSTOMER} or {@code ROLE_ADMIN}).
 * ADMIN tokens are additionally checked against {@link AdminTokenValidator} so a revoked admin
 * cannot keep using a token that is still cryptographically valid.
 */
@Slf4j
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final AdminTokenValidator adminTokenValidator;

    public JwtAuthFilter(JwtService jwtService, AdminTokenValidator adminTokenValidator) {
        this.jwtService = jwtService;
        this.adminTokenValidator = adminTokenValidator;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain)
            throws ServletException, IOException {

        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith(BEARER_PREFIX)
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            String token = header.substring(BEARER_PREFIX.length()).trim();
            try {
                AuthPrincipal principal = jwtService.parse(token);
                // Stateless tokens live for weeks — re-check that an ADMIN token has not been
                // revoked (deactivated account / password change bumps token_version).
                if (!adminTokenValidator.isValid(principal)) {
                    log.debug("Rejected revoked admin token for {}", principal.telegramUserId());
                    SecurityContextHolder.clearContext();
                    filterChain.doFilter(request, response);
                    return;
                }
                var authorities = List.of(new SimpleGrantedAuthority(principal.role().authority()));
                var authentication = new UsernamePasswordAuthenticationToken(principal, null, authorities);
                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            } catch (JwtException | IllegalArgumentException e) {
                log.debug("Rejected JWT: {}", e.getMessage());
                SecurityContextHolder.clearContext();
            }
        }
        filterChain.doFilter(request, response);
    }
}
