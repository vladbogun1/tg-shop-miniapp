package com.maxsolch.shop.customer.api;

import com.maxsolch.shop.customer.app.VisitorLocationService;
import com.maxsolch.shop.platform.web.ClientIp;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.platform.security.Role;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Runs right after {@code JwtAuthFilter}: for a signed-in customer (Mini App bearer token or the
 * site's cookie session) hands the request's real IP to {@link VisitorLocationService}, which
 * throttles and writes in the background. Admin tokens and anonymous requests are ignored here;
 * anonymous website visitors are recorded by {@code PublicAnalyticsController} under their
 * browser id. Never fails the request.
 */
@Component
public class VisitorLocationFilter extends OncePerRequestFilter
        implements com.maxsolch.shop.platform.security.PostAuthenticationFilter {

    private final VisitorLocationService locations;
    private final CurrentActor actor;

    public VisitorLocationFilter(VisitorLocationService locations, CurrentActor actor) {
        this.locations = locations;
        this.actor = actor;
    }

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        String uri = request.getRequestURI();
        return uri == null
                || !uri.startsWith("/api/")
                || uri.startsWith("/api/admin/")
                // the website's journal is recorded by its controller (it also knows the anonId)
                || uri.equals("/api/public/analytics");
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        try {
            actor.principalIfPresent().filter(p -> p.role() == Role.CUSTOMER).ifPresent(p ->
                    locations.touchUser(p.telegramUserId(),
                            p.isWeb() ? VisitorLocationService.WEB : VisitorLocationService.MINIAPP,
                            ClientIp.of(request)));
        } catch (RuntimeException ignored) {
            // the map is a nice-to-have; the request is not
        }
        chain.doFilter(request, response);
    }
}
