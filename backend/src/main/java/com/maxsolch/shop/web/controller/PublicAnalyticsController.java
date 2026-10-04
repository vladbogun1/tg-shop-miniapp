package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.analytics.ClientEventService;
import com.maxsolch.shop.analytics.WebEventBatch;
import com.maxsolch.shop.security.AuthPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Event journal of the public website. Open to anonymous visitors (the funnel starts long before
 * anyone signs in); when the {@code access} cookie is present the events are also tied to the
 * customer's Telegram id. Rate-limited per IP together with the other {@code /api/public/**} calls.
 */
@RestController
@RequestMapping("/api/public")
@Tag(name = "Public analytics", description = "Website event journal (batched)")
public class PublicAnalyticsController {

    private final ClientEventService clientEventService;

    public PublicAnalyticsController(ClientEventService clientEventService) {
        this.clientEventService = clientEventService;
    }

    @PostMapping("/analytics")
    @Operation(summary = "Submit a batch of website events (anonymous or signed-in)")
    public ResponseEntity<Void> analytics(@RequestBody WebEventBatch batch) {
        clientEventService.recordWeb(currentCustomerOrNull(), batch);
        return ResponseEntity.noContent().build();
    }

    private static Long currentCustomerOrNull() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof AuthPrincipal p) {
            return p.telegramUserId();
        }
        return null;
    }
}
