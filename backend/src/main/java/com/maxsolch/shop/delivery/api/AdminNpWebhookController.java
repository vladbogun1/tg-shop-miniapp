package com.maxsolch.shop.delivery.api;

import com.maxsolch.shop.delivery.app.NpWebhookSubscriptions;
import com.maxsolch.shop.delivery.domain.NpTrackingPush.Subscription;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** «Миттєві статуси» in the NP settings; the work is {@link NpWebhookSubscriptions}. */
@RestController
@RequestMapping("/api/admin/np/webhook")
@RequiredAdmin
@Tag(name = "Admin Nova Poshta webhook", description = "Tracking push subscription")
@SecurityRequirement(name = "bearer-jwt")
public class AdminNpWebhookController {

    private final NpWebhookSubscriptions subscriptions;

    public AdminNpWebhookController(NpWebhookSubscriptions subscriptions) {
        this.subscriptions = subscriptions;
    }

    /** {@code companyTin}: blank = the ЄДРПОУ/ІПН of the sender counterparty from the cabinet. */
    public record SubscribeRequest(String companyTin) {
    }

    @GetMapping
    @Operation(summary = "Webhook config and current subscriptions")
    public NpWebhookSubscriptions.WebhookStatus status() {
        return subscriptions.status();
    }

    @PostMapping("/subscribe")
    @Operation(summary = "Create a «legal» tracking push subscription to this server")
    public Subscription subscribe(@RequestBody(required = false) SubscribeRequest body) {
        return subscriptions.subscribe(body == null ? null : body.companyTin());
    }

    @DeleteMapping("/subscriptions/{id}")
    @Operation(summary = "Delete a tracking push subscription")
    public void unsubscribe(@PathVariable String id) {
        subscriptions.unsubscribe(id);
    }
}
