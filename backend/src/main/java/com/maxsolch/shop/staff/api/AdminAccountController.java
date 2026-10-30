package com.maxsolch.shop.staff.api;

import com.maxsolch.shop.staff.app.AdminAccountService;
import com.maxsolch.shop.staff.app.AdminLoginLogService;
import com.maxsolch.shop.staff.app.AdminTotp;
import com.maxsolch.shop.staff.app.ClientInfo;
import com.maxsolch.shop.staff.app.TrustedDeviceService;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.platform.web.CurrentActor;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * «Мой аккаунт» — every admin, own account only: profile, password, 2FA re-setup, sign-in history,
 * trusted devices. Managing OTHER admins is stage 2 and will be {@code @RequiredSuperAdmin}.
 */
@RestController
@RequestMapping("/api/admin/account")
@RequiredAdmin
@Tag(name = "Admin Account", description = "The signed-in admin's own account: password, 2FA, sign-ins, devices")
@SecurityRequirement(name = "bearer-jwt")
public class AdminAccountController {

    private final AdminAccountService accountService;
    private final AdminTotp totp;
    private final TrustedDeviceService trustedDevices;
    private final CurrentActor actor;

    public AdminAccountController(AdminAccountService accountService, AdminTotp totp,
                                  TrustedDeviceService trustedDevices, CurrentActor actor) {
        this.actor = actor;
        this.accountService = accountService;
        this.totp = totp;
        this.trustedDevices = trustedDevices;
    }

    @GetMapping
    @Operation(summary = "Own profile: name, login, role, 2FA status, trusted devices")
    public AdminAccountService.Profile profile() {
        return accountService.profile(actor.userId());
    }

    @GetMapping("/logins")
    @Operation(summary = "Last 20 sign-in attempts of this admin")
    public List<com.maxsolch.shop.staff.domain.LoginLogEntry> logins() {
        return accountService.history(actor.userId());
    }

    @PostMapping("/password")
    @Operation(summary = "Change password (current password + code); ends all other sessions")
    public AccessTokenResponse changePassword(@Valid @RequestBody AdminPasswordChangeRequest request,
                                              HttpServletRequest http, HttpServletResponse response) {
        String token = accountService.changePassword(actor.userId(), request.currentPassword(),
                request.newPassword(), request.code(), ClientInfo.of(http));
        trustedDevices.clearCookie(response);
        return new AccessTokenResponse(token);
    }

    @PostMapping("/2fa/reset")
    @Operation(summary = "2FA re-setup, step 1: current code → new secret")
    public TwoFactorSetupResponse startTotpReset(@Valid @RequestBody TotpCodeRequest request, HttpServletRequest http) {
        AdminTotp.NewSecret s = accountService.startTotpReset(actor.userId(), request.code(),
                ClientInfo.of(http));
        String account = accountService.profile(actor.userId()).username();
        return new TwoFactorSetupResponse(s.secret(), s.otpauthUri(), account, totp.issuer());
    }

    @PostMapping("/2fa/confirm")
    @Operation(summary = "2FA re-setup, step 2: code from the new secret; ends all other sessions")
    public AccessTokenResponse confirmTotpReset(@Valid @RequestBody TotpCodeRequest request,
                                                HttpServletRequest http, HttpServletResponse response) {
        String token = accountService.confirmTotpReset(actor.userId(), request.code(),
                ClientInfo.of(http));
        trustedDevices.clearCookie(response);
        return new AccessTokenResponse(token);
    }

    @PostMapping("/devices/forget")
    @Operation(summary = "«Забыть все устройства»: every trusted device asks for the code again")
    public Map<String, Integer> forgetDevices(HttpServletResponse response) {
        int n = accountService.forgetDevices(actor.userId());
        trustedDevices.clearCookie(response);
        return Map.of("forgotten", n);
    }
}
