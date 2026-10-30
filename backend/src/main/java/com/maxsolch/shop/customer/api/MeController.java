package com.maxsolch.shop.customer.api;

import com.maxsolch.shop.customer.app.CustomerLocaleChoice;
import com.maxsolch.shop.customer.app.CustomerProfileService;
import com.maxsolch.shop.customer.app.MeProfileDto;
import com.maxsolch.shop.platform.web.CurrentActor;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The customer's own profile. Orders, chat and uploads are {@code order.api.MeOrdersController}, the money of an order
 * is {@code payment.api}, the gift case {@code gift.api}, the promo code {@code promo.api}, the event batch
 * {@code analytics.api}; they all keep the {@code /api/me} prefix.
 */
@RestController
@RequestMapping("/api/me")
@Tag(name = "Me", description = "Customer profile, orders and chat")
@SecurityRequirement(name = "bearer-jwt")
@PreAuthorize("hasRole('CUSTOMER')")
public class MeController {

    private final CustomerProfileService profiles;
    private final CustomerLocaleChoice localeChoice;
    private final CurrentActor actor;

    public MeController(CustomerProfileService profiles, CustomerLocaleChoice localeChoice, CurrentActor actor) {
        this.profiles = profiles;
        this.localeChoice = localeChoice;
        this.actor = actor;
    }

    @GetMapping
    @Operation(summary = "Current customer profile")
    public MeProfileDto me() {
        return profiles.profile(actor.userId());
    }

    /**
     * Remembers the language the customer chose in the app, so the bot writes to them in it.
     *
     * <p>Separate from the `language_code` Telegram reports, which is overwritten on every sign-in:
     * a deliberate choice must not be undone by a device setting. An unsupported value is ignored
     * rather than rejected — the app would have nothing useful to do with the error.
     */
    @PostMapping("/locale")
    @Operation(summary = "Remember the customer's interface language")
    public ResponseEntity<Void> setLocale(@RequestParam String locale) {
        localeChoice.choose(actor.userId(), locale);
        return ResponseEntity.noContent().build();
    }
}
