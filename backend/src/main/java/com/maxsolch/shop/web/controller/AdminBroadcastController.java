package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.service.BroadcastService;
import com.maxsolch.shop.web.dto.AdminTargetDto;
import com.maxsolch.shop.web.dto.BroadcastRequest;
import com.maxsolch.shop.web.dto.BroadcastResult;
import com.maxsolch.shop.web.dto.BroadcastStatus;
import com.maxsolch.shop.web.dto.BroadcastTestRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/broadcast")
@RequiredAdmin
@Tag(name = "Admin Broadcast", description = "Send HTML Telegram broadcasts to bot users")
@SecurityRequirement(name = "bearer-jwt")
public class AdminBroadcastController {

    private final BroadcastService broadcastService;
    private final AdminUserRepository adminUserRepository;

    public AdminBroadcastController(BroadcastService broadcastService, AdminUserRepository adminUserRepository) {
        this.broadcastService = broadcastService;
        this.adminUserRepository = adminUserRepository;
    }

    @GetMapping("/audiences")
    @Operation(summary = "Reachable audience sizes (all/active/inactive/premium)")
    public Map<String, Integer> audiences() {
        return broadcastService.audienceCounts();
    }

    @GetMapping("/admins")
    @Operation(summary = "Active admins — quick targets for a test send")
    public List<AdminTargetDto> admins() {
        return adminUserRepository.findAllByActiveTrue().stream()
                .map(a -> new AdminTargetDto(a.getTelegramUserId(), a.getName(), a.getUsername()))
                .toList();
    }

    @GetMapping("/status")
    @Operation(summary = "Progress of the running/last broadcast")
    public BroadcastStatus status() {
        return broadcastService.status();
    }

    @PostMapping("/test")
    @Operation(summary = "Send one test message to a specific Telegram user id")
    public BroadcastResult test(@Valid @RequestBody BroadcastTestRequest req) {
        return broadcastService.test(req.text(), req.telegramUserId());
    }

    @PostMapping
    @Operation(summary = "Start an async broadcast to the chosen audience")
    public BroadcastStatus start(@Valid @RequestBody BroadcastRequest req) {
        return broadcastService.start(req.text(), req.audience());
    }
}
