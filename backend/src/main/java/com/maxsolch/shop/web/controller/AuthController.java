package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.common.ClientIp;
import com.maxsolch.shop.security.JwtService;
import com.maxsolch.shop.service.AuthService;
import com.maxsolch.shop.web.dto.AdminLoginRequest;
import com.maxsolch.shop.web.dto.AuthResponse;
import com.maxsolch.shop.web.dto.TelegramAuthRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Auth", description = "Telegram WebApp authentication")
public class AuthController {

    private final AuthService authService;
    private final AdminAuditService audit;
    private final JwtService jwtService;

    public AuthController(AuthService authService, AdminAuditService audit, JwtService jwtService) {
        this.authService = authService;
        this.audit = audit;
        this.jwtService = jwtService;
    }

    @PostMapping("/telegram")
    @Operation(summary = "Customer login via Telegram initData")
    public AuthResponse telegram(@Valid @RequestBody TelegramAuthRequest request) {
        return authService.authenticateCustomer(request.initData());
    }

    // Admin sign-ins (ok and failed) go to the audit log with method and IP (A11 / В-3 г).

    @PostMapping("/admin/telegram")
    @Operation(summary = "Admin login via Telegram initData (must be in admin_users)")
    public AuthResponse adminTelegram(@Valid @RequestBody TelegramAuthRequest request,
                                      HttpServletRequest http) {
        try {
            AuthResponse res = authService.authenticateAdmin(request.initData());
            audit.recordLogin(true, "telegram", adminIdOf(res), null, ClientIp.of(http));
            return res;
        } catch (RuntimeException e) {
            audit.recordLogin(false, "telegram", null, null, ClientIp.of(http));
            throw e;
        }
    }

    @PostMapping("/admin/login")
    @Operation(summary = "Admin browser login via username + password")
    public AuthResponse adminLogin(@Valid @RequestBody AdminLoginRequest request, HttpServletRequest http) {
        try {
            AuthResponse res = authService.authenticateAdminPassword(request.username(), request.password());
            audit.recordLogin(true, "пароль", adminIdOf(res), request.username(), ClientIp.of(http));
            return res;
        } catch (RuntimeException e) {
            audit.recordLogin(false, "пароль", null, request.username(), ClientIp.of(http));
            throw e;
        }
    }

    private Long adminIdOf(AuthResponse res) {
        try {
            return jwtService.parse(res.accessToken()).telegramUserId();
        } catch (RuntimeException e) {
            return null;
        }
    }
}
