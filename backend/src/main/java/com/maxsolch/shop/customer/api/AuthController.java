package com.maxsolch.shop.customer.api;

import com.maxsolch.shop.customer.app.AuthResponse;
import com.maxsolch.shop.customer.app.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Customer login (Telegram initData). The admin sign-in is {@code staff.api.AdminAuthController}, same prefix. */
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
}
