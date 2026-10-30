package com.maxsolch.shop.promo.api;

import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.promo.app.CaseLowMargin;
import com.maxsolch.shop.promo.app.PromoPreviewDto;
import com.maxsolch.shop.promo.app.PromoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;

/** The promo code in the cart: check and hold while it is typed, give back when it is cleared. */
@RestController
@RequestMapping("/api/me")
@Tag(name = "Me", description = "Customer profile, orders and chat")
@SecurityRequirement(name = "bearer-jwt")
@PreAuthorize("hasRole('CUSTOMER')")
public class MePromoController {

    private final PromoService promoService;
    private final ActivityLog activity;
    private final CurrentActor actor;

    public MePromoController(PromoService promoService, ActivityLog activity, CurrentActor actor) {
        this.promoService = promoService;
        this.activity = activity;
        this.actor = actor;
    }

    /**
     * Checks the code for this cart and, when it is a limited one, holds it for this customer for
     * half an hour. The cart calls this as the code is typed, so the discount shown there is the
     * discount the order will actually get — and cannot be taken by somebody else's checkout in
     * the meantime.
     */
    @PostMapping("/promo/reserve")
    @Operation(summary = "Validate a promo code and hold it for this customer")
    public PromoPreviewDto reservePromo(@RequestParam String code,
                                        @RequestParam long subtotalMinor,
                                        @RequestParam(required = false) String items) {
        // items: the cart's lines "id*qty,…" — a case code is counted without the low-margin products.
        PromoPreviewDto preview = promoService.reserve(code, subtotalMinor, actor.userId(),
                CaseLowMargin.parseItems(items));
        // Only accepted codes: the cart checks as the code is typed, so refusals are mostly half-typed words.
        if (preview != null && preview.valid()) {
            activity.record(activity.fromRequest("PROMO_APPLIED")
                    .text("Промокод " + code.trim().toUpperCase(Locale.ROOT) + " принят: скидка "
                            + MoneyFormat.amount(preview.discountMinor()) + " грн")
                    .detail("code", code.trim().toUpperCase(Locale.ROOT))
                    .detail("discountMinor", preview.discountMinor())
                    .detail("subtotalMinor", subtotalMinor));
        }
        return preview;
    }

    /** Gives a held code back when the customer clears or replaces it. */
    @DeleteMapping("/promo/reserve")
    @Operation(summary = "Release a held promo code")
    public ResponseEntity<Void> releasePromo(@RequestParam String code) {
        promoService.release(code, actor.userId());
        return ResponseEntity.noContent().build();
    }
}
