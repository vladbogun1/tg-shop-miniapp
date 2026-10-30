package com.maxsolch.shop.customer.api;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.web.ClientIp;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.platform.security.AuthPrincipal;
import com.maxsolch.shop.platform.security.CookieOriginGuard;
import com.maxsolch.shop.platform.security.WebCookies;
import com.maxsolch.shop.customer.app.WebAuthService;
import com.maxsolch.shop.customer.app.WebAuthDtos.CompleteRequest;
import com.maxsolch.shop.customer.app.WebAuthDtos.StartResponse;
import com.maxsolch.shop.customer.app.WebAuthDtos.StatusResponse;
import com.maxsolch.shop.customer.app.WebAuthDtos.WebAuthResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public site login through the Telegram bot. Tokens never appear in a response body — only in
 * HttpOnly cookies (see {@link WebCookies}). The flow is described on {@link WebAuthService}.
 *
 * <p>The cookie-driven POSTs (complete / refresh / logout) also require an allowed
 * {@code Origin}: the browser attaches those cookies on its own, so without the check any page on
 * a sibling port of the same site could drive them.
 */
@RestController
@RequestMapping("/api/auth/web")
@Tag(name = "Site auth", description = "Public website login via the Telegram bot (cookie sessions)")
public class WebAuthController {

    private final WebAuthService webAuthService;
    private final WebCookies cookies;
    private final CookieOriginGuard originGuard;
    private final CurrentActor actor;

    public WebAuthController(WebAuthService webAuthService, WebCookies cookies, CookieOriginGuard originGuard,
                             CurrentActor actor) {
        this.webAuthService = webAuthService;
        this.cookies = cookies;
        this.originGuard = originGuard;
        this.actor = actor;
    }

    @PostMapping("/start")
    @Operation(summary = "Start a bot login: returns the deep link + number to pick; sets login_bind")
    public StartResponse start(HttpServletRequest request, HttpServletResponse response) {
        WebAuthService.StartResult r = webAuthService.start(request.getHeader("User-Agent"), ClientIp.of(request));
        cookies.setLoginBind(response, r.bindSecret());
        return new StartResponse(r.loginId(), r.deepLink(), r.matchCode(), r.expiresAt());
    }

    @GetMapping("/status")
    @Operation(summary = "Poll a login: PENDING | CONFIRMED | REJECTED | EXPIRED | USED")
    public StatusResponse status(@RequestParam String loginId) {
        return new StatusResponse(webAuthService.status(loginId).name());
    }

    @PostMapping("/complete")
    @Operation(summary = "Finish a CONFIRMED login in the browser that started it; sets access + refresh")
    public WebAuthResponse complete(@Valid @RequestBody CompleteRequest body,
                                    HttpServletRequest request, HttpServletResponse response) {
        requireTrustedOrigin(request);
        WebAuthService.Tokens t = webAuthService.complete(body.loginId(),
                WebCookies.read(request, WebCookies.LOGIN_BIND),
                request.getHeader("User-Agent"), ClientIp.of(request));
        cookies.clearLoginBind(response);
        cookies.setAccess(response, t.accessJwt());
        cookies.setRefresh(response, t.refreshToken());
        return new WebAuthResponse(t.user());
    }

    @PostMapping("/refresh")
    @Operation(summary = "Rotate the refresh cookie and issue a new access cookie (401 if none/invalid)")
    public WebAuthResponse refresh(HttpServletRequest request, HttpServletResponse response) {
        requireTrustedOrigin(request);
        String refresh = WebCookies.read(request, WebCookies.REFRESH);
        if (refresh == null) {
            throw new DomainException.Unauthorized("no refresh token", null);
        }
        try {
            WebAuthService.Tokens t = webAuthService.refresh(refresh,
                    request.getHeader("User-Agent"), ClientIp.of(request));
            cookies.setAccess(response, t.accessJwt());
            cookies.setRefresh(response, t.refreshToken());
            return new WebAuthResponse(t.user());
        } catch (DomainException.Unauthorized e) {
            // A rotated-away token from a parallel tab keeps its cookies (the winner already set
            // fresh ones); anything else means this browser is logged out.
            if (!WebAuthService.REFRESH_RACE.equals(e.getMessage())) {
                cookies.clearSession(response);
            }
            throw e;
        }
    }

    @PostMapping("/logout")
    @Operation(summary = "End the current site session and clear the cookies")
    public ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        requireTrustedOrigin(request);
        webAuthService.logout(WebCookies.read(request, WebCookies.REFRESH), currentSessionId());
        cookies.clearSession(response);
        cookies.clearLoginBind(response);
        return ResponseEntity.noContent().build();
    }

    private void requireTrustedOrigin(HttpServletRequest request) {
        if (!originGuard.isTrustedOrigin(request)) {
            throw new DomainException.Forbidden("origin not allowed");
        }
    }

    private String currentSessionId() {
        return actor.principalIfPresent().filter(AuthPrincipal::isWeb).map(AuthPrincipal::sessionId).orElse(null);
    }
}
