package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.common.ClientIp;
import com.maxsolch.shop.security.WebCookies;
import com.maxsolch.shop.service.WebAuthService;
import com.maxsolch.shop.web.dto.WebAuthDtos.DevLoginRequest;
import com.maxsolch.shop.web.dto.WebAuthDtos.WebAuthResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Local testing of the site without Telegram: logs in as any telegram user id, exactly like a
 * completed bot login (same cookies, same session row).
 *
 * <p>Exists ONLY under the {@code dev} profile — in any other profile the bean is not created and
 * the path is a plain 404. The profile itself is guarded by StartupSecurityCheck-style rules:
 * production runs {@code prod}.
 */
@Slf4j
@Profile("dev")
@RestController
@RequestMapping("/api/auth/web")
@Tag(name = "Site auth")
public class DevWebLoginController {

    private final WebAuthService webAuthService;
    private final WebCookies cookies;

    public DevWebLoginController(WebAuthService webAuthService, WebCookies cookies) {
        this.webAuthService = webAuthService;
        this.cookies = cookies;
        log.warn("DEV: POST /api/auth/web/dev-login is enabled (profile dev) — logs in as any user.");
    }

    @PostMapping("/dev-login")
    @Operation(summary = "DEV ONLY: log in to the site as any telegram user id")
    public WebAuthResponse devLogin(@Valid @RequestBody DevLoginRequest body,
                                    HttpServletRequest request, HttpServletResponse response) {
        WebAuthService.Tokens t = webAuthService.devLogin(body.telegramUserId(),
                request.getHeader("User-Agent"), ClientIp.of(request));
        cookies.setAccess(response, t.accessJwt());
        cookies.setRefresh(response, t.refreshToken());
        return new WebAuthResponse(t.user());
    }
}
