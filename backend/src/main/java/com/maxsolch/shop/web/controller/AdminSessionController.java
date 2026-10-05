package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.adminauth.AdminAccountService;
import com.maxsolch.shop.security.AdminTokenRevocations;
import com.maxsolch.shop.security.AuthPrincipal;
import com.maxsolch.shop.security.JwtService;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.security.Role;
import com.maxsolch.shop.web.SecurityUtil;
import com.maxsolch.shop.web.dto.AuthResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The admin's own session: quiet token renewal while the panel is in use, logout of this device
 * and logout of every device.
 *
 * <p>Admin tokens are short-lived (12 h by default) — a leaked one is not a month-long key to the
 * admin panel any more. Instead of logging an active admin out every 12 hours, the panel
 * calls {@code /token/refresh} once its token is past half-life, and an idle panel simply expires.
 */
@RestController
@RequestMapping("/api/admin")
@RequiredAdmin
@Tag(name = "Admin Session", description = "Admin token refresh and logout")
@SecurityRequirement(name = "bearer-jwt")
public class AdminSessionController {

    private final JwtService jwtService;
    private final AdminTokenRevocations revocations;
    private final AdminAccountService accountService;

    public AdminSessionController(JwtService jwtService,
                                  AdminTokenRevocations revocations,
                                  AdminAccountService accountService) {
        this.jwtService = jwtService;
        this.revocations = revocations;
        this.accountService = accountService;
    }

    /**
     * A fresh token for the same admin and token version. Only reachable with a token that is still
     * valid (not expired, not revoked), so it cannot resurrect a logged-out session. The old token
     * is left to expire on its own: requests already in flight with it must not start failing.
     */
    @PostMapping("/token/refresh")
    @Operation(summary = "Re-issue the admin token (same admin, same token version, new expiry)")
    public AuthResponse refresh() {
        AuthPrincipal p = SecurityUtil.currentPrincipal();
        return AuthResponse.tokenOnly(jwtService.issueToken(p.telegramUserId(), Role.ADMIN, p.tokenVersion()));
    }

    /** «Выйти»: this token stops working at once; other devices stay logged in. */
    @PostMapping("/logout")
    @Operation(summary = "Revoke the current admin token")
    public ResponseEntity<Void> logout() {
        AuthPrincipal p = SecurityUtil.currentPrincipal();
        revocations.revoke(p.tokenId(), p.telegramUserId(), p.expiresAt());
        return ResponseEntity.noContent().build();
    }

    /**
     * «Выйти на всех устройствах»: bumps {@code admin_users.token_version}, which invalidates every
     * token issued to this admin so far — including the one making this call — and every
     * half-finished sign-in, and forgets every trusted device.
     */
    @PostMapping("/logout-all")
    @Operation(summary = "Revoke every token of the current admin (token_version + 1)")
    public ResponseEntity<Void> logoutAll() {
        accountService.logoutEverywhere(SecurityUtil.currentUserId());
        return ResponseEntity.noContent().build();
    }
}
