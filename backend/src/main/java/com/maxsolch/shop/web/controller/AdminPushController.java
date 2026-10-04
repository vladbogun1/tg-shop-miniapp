package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.push.AdminPushService;
import com.maxsolch.shop.push.AdminPushService.PushConfig;
import com.maxsolch.shop.push.AdminPushService.SendResult;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.web.SecurityUtil;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Web Push for the admin PWA: «Уведомления на этом устройстве» in the settings.
 * The body of subscribe is the browser's {@code PushSubscription.toJSON()}.
 */
@RestController
@RequestMapping("/api/admin/push")
@RequiredAdmin
@Tag(name = "Admin Push", description = "Push notifications to the admin's devices")
@SecurityRequirement(name = "bearer-jwt")
public class AdminPushController {

    public record Keys(@NotBlank @Size(max = 255) String p256dh, @NotBlank @Size(max = 64) String auth) {
    }

    public record SubscribeRequest(@NotBlank @Size(max = 2048) String endpoint, @NotNull @Valid Keys keys) {
    }

    public record EndpointRequest(@Size(max = 2048) String endpoint) {
    }

    private final AdminPushService push;

    public AdminPushController(AdminPushService push) {
        this.push = push;
    }

    @GetMapping("/config")
    @Operation(summary = "Is push configured on the server, the VAPID public key, subscribed devices of this admin")
    public PushConfig config() {
        return push.config(SecurityUtil.currentUserId());
    }

    @PostMapping("/subscribe")
    @Operation(summary = "Register this device (PushSubscription.toJSON()); idempotent")
    public ResponseEntity<Void> subscribe(@Valid @RequestBody SubscribeRequest body,
                                          @RequestHeader(value = "User-Agent", required = false) String userAgent) {
        push.subscribe(SecurityUtil.currentUserId(), body.endpoint(), body.keys().p256dh(), body.keys().auth(), userAgent);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/unsubscribe")
    @Operation(summary = "Forget this device")
    public ResponseEntity<Void> unsubscribe(@RequestBody EndpointRequest body) {
        push.unsubscribe(body == null ? null : body.endpoint());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/test")
    @Operation(summary = "Send a test notification to this device (or all devices of this admin)")
    public SendResult test(@RequestBody(required = false) EndpointRequest body) {
        return push.sendTest(SecurityUtil.currentUserId(), body == null ? null : body.endpoint());
    }
}
