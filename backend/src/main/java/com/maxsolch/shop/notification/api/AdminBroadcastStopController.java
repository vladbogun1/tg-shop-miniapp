package com.maxsolch.shop.notification.api;

import com.maxsolch.shop.notification.app.BroadcastHistoryDto;
import com.maxsolch.shop.notification.app.BroadcastStop;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/broadcast/stop")
@RequiredAdmin
@Tag(name = "Admin Broadcast", description = "Send HTML Telegram broadcasts to bot users")
@SecurityRequirement(name = "bearer-jwt")
public class AdminBroadcastStopController {

    private final BroadcastStop stop;

    public AdminBroadcastStopController(BroadcastStop stop) {
        this.stop = stop;
    }

    @PostMapping
    @Operation(summary = "Stop the running broadcast: sent ones stay, unsent ones are not sent; idempotent; 409 when nothing is running")
    public BroadcastHistoryDto stop() {
        return stop.stop();
    }
}
