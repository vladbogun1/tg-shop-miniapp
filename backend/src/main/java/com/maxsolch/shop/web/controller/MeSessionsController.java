package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.security.AuthPrincipal;
import com.maxsolch.shop.security.WebCookies;
import com.maxsolch.shop.service.WebAuthService;
import com.maxsolch.shop.web.SecurityUtil;
import com.maxsolch.shop.web.dto.WebAuthDtos.WebSessionDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** The customer's logged-in browsers on the public site ("Активные сеансы" in the account). */
@RestController
@RequestMapping("/api/me/sessions")
@Tag(name = "Me", description = "Customer profile, orders and chat")
@SecurityRequirement(name = "bearer-jwt")
@PreAuthorize("hasRole('CUSTOMER')")
public class MeSessionsController {

    private final WebAuthService webAuthService;
    private final WebCookies cookies;

    public MeSessionsController(WebAuthService webAuthService, WebCookies cookies) {
        this.webAuthService = webAuthService;
        this.cookies = cookies;
    }

    @GetMapping
    @Operation(summary = "Active site sessions; `current` marks the one making this request")
    public List<WebSessionDto> list() {
        AuthPrincipal p = SecurityUtil.currentPrincipal();
        return webAuthService.listSessions(p.telegramUserId(), p.isWeb() ? p.sessionId() : null);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "End one site session")
    public ResponseEntity<Void> revoke(@PathVariable String id, HttpServletResponse response) {
        AuthPrincipal p = SecurityUtil.currentPrincipal();
        webAuthService.revokeSession(p.telegramUserId(), id);
        if (p.isWeb() && id.equalsIgnoreCase(p.sessionId())) {
            cookies.clearSession(response);
        }
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping
    @Operation(summary = "End all site sessions (including this one)")
    public ResponseEntity<Void> revokeAll(HttpServletResponse response) {
        AuthPrincipal p = SecurityUtil.currentPrincipal();
        webAuthService.revokeAll(p.telegramUserId());
        if (p.isWeb()) {
            cookies.clearSession(response);
        }
        return ResponseEntity.noContent().build();
    }
}
