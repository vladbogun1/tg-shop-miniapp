package com.maxsolch.shop.payment.api;

import com.maxsolch.shop.payment.app.MonobankWebhooks;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * monobank posts invoice status changes here (up to 3 attempts until it gets 200). Public — the
 * {@code X-Sign} ECDSA signature over the raw body is the authentication ({@link MonobankWebhooks}).
 */
@RestController
@Tag(name = "Payments", description = "monobank acquiring webhook")
public class MonobankWebhookController {

    private final MonobankWebhooks webhooks;

    public MonobankWebhookController(MonobankWebhooks webhooks) {
        this.webhooks = webhooks;
    }

    @PostMapping("/api/payments/mono/webhook")
    @Operation(summary = "monobank invoice status webhook (signed with X-Sign)")
    public ResponseEntity<Void> webhook(@RequestBody(required = false) byte[] body,
                                        @RequestHeader(value = "X-Sign", required = false) String xSign) {
        return switch (webhooks.handle(body, xSign)) {
            case IGNORED, UNREADABLE -> ResponseEntity.badRequest().build();
            case BAD_SIGNATURE -> ResponseEntity.status(401).build();
            case APPLIED -> ResponseEntity.ok().build();
        };
    }
}
