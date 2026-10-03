package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.common.ClientIp;
import com.maxsolch.shop.security.AuthPrincipal;
import com.maxsolch.shop.security.CookieOriginGuard;
import com.maxsolch.shop.security.WebCookies;
import com.maxsolch.shop.service.WebAuthService;
import com.maxsolch.shop.web.ForbiddenException;
import com.maxsolch.shop.web.UnauthorizedException;
import com.maxsolch.shop.web.dto.WebAuthDtos.CompleteRequest;
import com.maxsolch.shop.web.dto.WebAuthDtos.StartResponse;
import com.maxsolch.shop.web.dto.WebAuthDtos.StatusResponse;
import com.maxsolch.shop.web.dto.WebAuthDtos.WebAuthResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
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

    public WebAuthController(WebAuthService webAuthService, WebCookies cookies, CookieOriginGuard originGuard) {
        this.webAuthService = webAuthService;
        this.cookies = cookies;
        this.originGuard = originGuard;
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
            throw new UnauthorizedException("no refresh token");
        }
        try {
            WebAuthService.Tokens t = webAuthService.refresh(refresh,
                    request.getHeader("User-Agent"), ClientIp.of(request));
            cookies.setAccess(response, t.accessJwt());
            cookies.setRefresh(response, t.refreshToken());
            return new WebAuthResponse(t.user());
        } catch (UnauthorizedException e) {
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
            throw new ForbiddenException("origin not allowed");
        }
    }

    private static String currentSessionId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof AuthPrincipal p && p.isWeb()) {
            return p.sessionId();
        }
        return null;
    }
}
