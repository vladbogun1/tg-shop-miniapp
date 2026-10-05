package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.adminauth.AdminAuthService;
import com.maxsolch.shop.adminauth.ClientInfo;
import com.maxsolch.shop.adminauth.TrustedDeviceService;
import com.maxsolch.shop.service.AuthService;
import com.maxsolch.shop.web.dto.AdminLoginRequest;
import com.maxsolch.shop.web.dto.AdminLoginResponse;
import com.maxsolch.shop.web.dto.AuthResponse;
import com.maxsolch.shop.web.dto.PreAuthRequest;
import com.maxsolch.shop.web.dto.TelegramAuthRequest;
import com.maxsolch.shop.web.dto.TwoFactorRequest;
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
 * Customer login (Telegram initData) and the two-step admin sign-in — see {@link AdminAuthService}.
 * The admin endpoints are served only by the admin gateway (:667).
 */
@RestController
@RequestMapping("/api/auth")
@Tag(name = "Auth", description = "Telegram WebApp authentication, admin sign-in with 2FA")
public class AuthController {

    private final AuthService authService;
    private final AdminAuthService adminAuth;
    private final TrustedDeviceService trustedDevices;

    public AuthController(AuthService authService, AdminAuthService adminAuth, TrustedDeviceService trustedDevices) {
        this.authService = authService;
        this.adminAuth = adminAuth;
        this.trustedDevices = trustedDevices;
    }

    @PostMapping("/telegram")
    @Operation(summary = "Customer login via Telegram initData")
    public AuthResponse telegram(@Valid @RequestBody TelegramAuthRequest request) {
        return authService.authenticateCustomer(request.initData());
    }

    @PostMapping("/admin/telegram")
    @Operation(summary = "Admin sign-in, first factor: Telegram initData (single use, short TTL)")
    public AdminLoginResponse adminTelegram(@Valid @RequestBody TelegramAuthRequest request,
                                            HttpServletRequest http, HttpServletResponse response) {
        return respond(adminAuth.telegramLogin(request.initData(), TrustedDeviceService.readCookie(http),
                ClientInfo.of(http)), response);
    }

    @PostMapping("/admin/login")
    @Operation(summary = "Admin sign-in, first factor: username + password")
    public AdminLoginResponse adminLogin(@Valid @RequestBody AdminLoginRequest request,
                                         HttpServletRequest http, HttpServletResponse response) {
        return respond(adminAuth.passwordLogin(request.username(), request.password(),
                TrustedDeviceService.readCookie(http), ClientInfo.of(http)), response);
    }

    @PostMapping("/admin/2fa/verify")
    @Operation(summary = "Admin sign-in, second factor: code from the authenticator app")
    public AdminLoginResponse verify(@Valid @RequestBody TwoFactorRequest request,
                                     HttpServletRequest http, HttpServletResponse response) {
        return respond(adminAuth.verify(request.preAuthToken(), request.code(), request.trustDevice(),
                ClientInfo.of(http)), response);
    }

    @PostMapping("/admin/2fa/setup")
    @Operation(summary = "First sign-in without 2FA: a new TOTP secret (QR / manual entry)")
    public TwoFactorSetupResponse setup(@Valid @RequestBody PreAuthRequest request) {
        AdminAuthService.SetupInfo s = adminAuth.setup(request.preAuthToken());
        return new TwoFactorSetupResponse(s.secret(), s.otpauthUri(), s.account(), s.issuer());
    }

    @PostMapping("/admin/2fa/confirm")
    @Operation(summary = "First sign-in without 2FA: confirm the new secret with a code and sign in")
    public AdminLoginResponse confirm(@Valid @RequestBody TwoFactorRequest request,
                                      HttpServletRequest http, HttpServletResponse response) {
        return respond(adminAuth.confirmSetup(request.preAuthToken(), request.code(), request.trustDevice(),
                ClientInfo.of(http)), response);
    }

    private AdminLoginResponse respond(AdminAuthService.Outcome o, HttpServletResponse response) {
        if (o.trustedDeviceToken() != null) {
            trustedDevices.setCookie(response, o.trustedDeviceToken());
        }
        return new AdminLoginResponse(o.status().name(), o.accessToken(), o.preAuthToken(), o.adminName());
    }
}
