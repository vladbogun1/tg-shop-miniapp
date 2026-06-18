package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.service.AuthService;
import com.maxsolch.shop.web.dto.AdminLoginRequest;
import com.maxsolch.shop.web.dto.AuthResponse;
import com.maxsolch.shop.web.dto.TelegramAuthRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
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

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/telegram")
    @Operation(summary = "Customer login via Telegram initData")
    public AuthResponse telegram(@Valid @RequestBody TelegramAuthRequest request) {
        return authService.authenticateCustomer(request.initData());
    }

    @PostMapping("/admin/telegram")
    @Operation(summary = "Admin login via Telegram initData (must be in admin_users)")
    public AuthResponse adminTelegram(@Valid @RequestBody TelegramAuthRequest request) {
        return authService.authenticateAdmin(request.initData());
    }

    @PostMapping("/admin/login")
    @Operation(summary = "Admin browser login via username + password")
    public AuthResponse adminLogin(@Valid @RequestBody AdminLoginRequest request) {
        return authService.authenticateAdminPassword(request.username(), request.password());
    }
}
