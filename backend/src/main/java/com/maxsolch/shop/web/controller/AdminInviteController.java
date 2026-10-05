package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.adminauth.AdminAuthService;
import com.maxsolch.shop.adminauth.AdminInviteService;
import com.maxsolch.shop.adminauth.ClientInfo;
import com.maxsolch.shop.adminauth.TrustedDeviceService;
import com.maxsolch.shop.web.dto.AdminLoginResponse;
import com.maxsolch.shop.web.dto.AdminTeamDtos.InviteAcceptRequest;
import com.maxsolch.shop.web.dto.AdminTeamDtos.InviteAcceptResponse;
import com.maxsolch.shop.web.dto.AdminTeamDtos.InviteCompleteRequest;
import com.maxsolch.shop.web.dto.AdminTeamDtos.InviteTokenRequest;
import com.maxsolch.shop.web.dto.TwoFactorSetupResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The public /invite/&lt;token&gt; page (no sign-in): check the link → login + password → code →
 * signed in. Under {@code /api/auth/admin/} — served only by the admin gateway, with its own per-IP
 * limit in RateLimitFilter. The token travels in the body, never in a URL of this API.
 */
@RestController
@RequestMapping("/api/auth/admin/invite")
@Tag(name = "Admin Invite", description = "Accept an invite link: set login, password and 2FA")
public class AdminInviteController {

    private final AdminInviteService invites;
    private final TrustedDeviceService trustedDevices;

    public AdminInviteController(AdminInviteService invites, TrustedDeviceService trustedDevices) {
        this.invites = invites;
        this.trustedDevices = trustedDevices;
    }

    @PostMapping("/check")
    @Operation(summary = "Is the link valid; what the form asks for")
    public AdminInviteService.InviteInfo check(@Valid @RequestBody InviteTokenRequest r) {
        return invites.check(r.token());
    }

    @PostMapping("/accept")
    @Operation(summary = "Step 1: login + password → SETUP (new TOTP secret) or VERIFY (current code)")
    public InviteAcceptResponse accept(@Valid @RequestBody InviteAcceptRequest r) {
        AdminInviteService.AcceptResult res = invites.accept(r.token(), r.username(), r.password());
        TwoFactorSetupResponse setup = res.setup() == null ? null : new TwoFactorSetupResponse(res.setup().secret(),
                res.setup().otpauthUri(), res.setup().account(), res.setup().issuer());
        return new InviteAcceptResponse(res.next(), setup);
    }

    @PostMapping("/complete")
    @Operation(summary = "Step 2: the code — burns the link, activates the account, signs in")
    public AdminLoginResponse complete(@Valid @RequestBody InviteCompleteRequest r, HttpServletRequest http,
                                       HttpServletResponse response) {
        AdminAuthService.Outcome o = invites.complete(r.token(), r.code(), r.trustDevice(), ClientInfo.of(http));
        if (o.trustedDeviceToken() != null) {
            trustedDevices.setCookie(response, o.trustedDeviceToken());
        }
        return new AdminLoginResponse(o.status().name(), o.accessToken(), null, o.adminName());
    }
}
