package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@Tag(name = "Admin", description = "Admin-only endpoints (require ROLE_ADMIN)")
@SecurityRequirement(name = "bearer-jwt")
public class AdminPingController {

    @GetMapping("/ping")
    @RequiredAdmin
    @Operation(summary = "Admin auth smoke test")
    public Map<String, Object> ping() {
        return Map.of("ok", true);
    }
}
