package com.maxsolch.shop.security;

import com.maxsolch.shop.config.AllowedOrigins;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.Locale;
import java.util.Set;

/**
 * CSRF protection for cookie-authenticated requests.
 *
 * <p>A bearer token is never attached by the browser on its own, so header auth needs no CSRF
 * defence. A cookie is: {@code SameSite=Lax} stops cross-SITE POSTs, but chisetup.com.ua and
 * all its subdomains (app., admin.) count as the same site. So a state-changing request authenticated by a cookie
 * must also prove where it came from: its {@code Origin} (or, failing that, {@code Referer}) has to
 * be one of {@link AllowedOrigins}. With neither header the request is refused — browsers always
 * send {@code Origin} on a fetch/XHR POST, so its absence means it did not come from our page.
 */
@Component
public class CookieOriginGuard {

    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");

    private final AllowedOrigins allowedOrigins;

    public CookieOriginGuard(AllowedOrigins allowedOrigins) {
        this.allowedOrigins = allowedOrigins;
    }

    public static boolean isMutating(HttpServletRequest request) {
        return !SAFE_METHODS.contains(request.getMethod().toUpperCase(Locale.ROOT));
    }

    /** True when the request's Origin (or Referer) is an allowed origin. */
    public boolean isTrustedOrigin(HttpServletRequest request) {
        String origin = request.getHeader("Origin");
        if (origin != null && !origin.isBlank()) {
            return allowedOrigins.isAllowed(origin);
        }
        String referer = request.getHeader("Referer");
        if (referer != null && !referer.isBlank()) {
            return allowedOrigins.isAllowed(originOf(referer));
        }
        return false;
    }

    /** scheme://host[:port] of a URL, or null if it is not one. */
    static String originOf(String url) {
        try {
            URI uri = URI.create(url.trim());
            if (uri.getScheme() == null || uri.getHost() == null) {
                return null;
            }
            return uri.getScheme().toLowerCase(Locale.ROOT) + "://" + uri.getHost().toLowerCase(Locale.ROOT)
                    + (uri.getPort() >= 0 ? ":" + uri.getPort() : "");
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
