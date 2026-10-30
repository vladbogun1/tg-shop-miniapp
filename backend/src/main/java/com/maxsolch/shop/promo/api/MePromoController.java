package com.maxsolch.shop.promo.api;

import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.promo.app.CartPromo;
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

/** The promo code in the cart: check and hold while it is typed, give back when it is cleared. */
@RestController
@RequestMapping("/api/me")
@Tag(name = "Me", description = "Customer profile, orders and chat")
@SecurityRequirement(name = "bearer-jwt")
@PreAuthorize("hasRole('CUSTOMER')")
public class MePromoController {

    private final PromoService promoService;
    private final CartPromo cartPromo;
    private final CurrentActor actor;

    public MePromoController(PromoService promoService, CartPromo cartPromo, CurrentActor actor) {
        this.promoService = promoService;
        this.cartPromo = cartPromo;
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
        return cartPromo.reserve(code, subtotalMinor, actor.userId(), items);
    }

    /** Gives a held code back when the customer clears or replaces it. */
    @DeleteMapping("/promo/reserve")
    @Operation(summary = "Release a held promo code")
    public ResponseEntity<Void> releasePromo(@RequestParam String code) {
        promoService.release(code, actor.userId());
        return ResponseEntity.noContent().build();
    }
}
