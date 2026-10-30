package com.maxsolch.shop.staff.api;

import com.maxsolch.shop.staff.app.AdminAuthService;
import com.maxsolch.shop.staff.app.ClientInfo;
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
 * The two-step admin sign-in — see {@link AdminAuthService}. Served only by the admin gateway
 * (admin.chisetup.com.ua); the URLs stay under {@code /api/auth/admin}.
 */
@RestController
@RequestMapping("/api/auth/admin")
@Tag(name = "Auth", description = "Admin sign-in with 2FA")
public class AdminAuthController {

    private final AdminAuthService adminAuth;
    private final TrustedDeviceCookie trustedDevices;

    public AdminAuthController(AdminAuthService adminAuth, TrustedDeviceCookie trustedDevices) {
        this.adminAuth = adminAuth;
        this.trustedDevices = trustedDevices;
    }

    @PostMapping("/telegram")
    @Operation(summary = "Admin sign-in, first factor: Telegram initData (single use, short TTL)")
    public AdminLoginResponse adminTelegram(@Valid @RequestBody AdminTelegramAuthRequest request,
                                            HttpServletRequest http, HttpServletResponse response) {
        return respond(adminAuth.telegramLogin(request.initData(), TrustedDeviceCookie.read(http),
                RequestClient.of(http)), response);
    }

    @PostMapping("/login")
    @Operation(summary = "Admin sign-in, first factor: username + password")
    public AdminLoginResponse adminLogin(@Valid @RequestBody AdminLoginRequest request,
                                         HttpServletRequest http, HttpServletResponse response) {
        return respond(adminAuth.passwordLogin(request.username(), request.password(),
                TrustedDeviceCookie.read(http), RequestClient.of(http)), response);
    }

    @PostMapping("/2fa/verify")
    @Operation(summary = "Admin sign-in, second factor: code from the authenticator app")
    public AdminLoginResponse verify(@Valid @RequestBody TwoFactorRequest request,
                                     HttpServletRequest http, HttpServletResponse response) {
        return respond(adminAuth.verify(request.preAuthToken(), request.code(), request.trustDevice(),
                RequestClient.of(http)), response);
    }

    @PostMapping("/2fa/setup")
    @Operation(summary = "First sign-in without 2FA: a new TOTP secret (QR / manual entry)")
    public TwoFactorSetupResponse setup(@Valid @RequestBody PreAuthRequest request) {
        AdminAuthService.SetupInfo s = adminAuth.setup(request.preAuthToken());
        return new TwoFactorSetupResponse(s.secret(), s.otpauthUri(), s.account(), s.issuer());
    }

    @PostMapping("/2fa/confirm")
    @Operation(summary = "First sign-in without 2FA: confirm the new secret with a code and sign in")
    public AdminLoginResponse confirm(@Valid @RequestBody TwoFactorRequest request,
                                      HttpServletRequest http, HttpServletResponse response) {
        return respond(adminAuth.confirmSetup(request.preAuthToken(), request.code(), request.trustDevice(),
                RequestClient.of(http)), response);
    }

    private AdminLoginResponse respond(AdminAuthService.Outcome o, HttpServletResponse response) {
        if (o.trustedDeviceToken() != null) {
            trustedDevices.set(response, o.trustedDeviceToken());
        }
        return new AdminLoginResponse(o.status().name(), o.accessToken(), o.preAuthToken(), o.adminName());
    }
}
