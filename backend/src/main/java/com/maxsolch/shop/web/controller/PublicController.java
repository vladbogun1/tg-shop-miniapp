package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.payment.app.PaymentOptionDto;
import com.maxsolch.shop.payment.app.PaymentOptions;
import com.maxsolch.shop.promo.app.PromoService;
import com.maxsolch.shop.translation.domain.ContentLocale;
import com.maxsolch.shop.translation.app.TranslationService;
import com.maxsolch.shop.promo.app.PromoPreviewDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Locale;

@RestController
@RequestMapping("/api")
@Tag(name = "Public", description = "Public payment options and promo preview")
public class PublicController {

    private final PaymentOptions paymentOptions;
    private final PromoService promoService;
    private final TranslationService translationService;

    public PublicController(PaymentOptions paymentOptions,
                            PromoService promoService, TranslationService translationService) {
        this.paymentOptions = paymentOptions;
        this.translationService = translationService;
        this.promoService = promoService;
    }

    /**
     * What a promo code is worth for this cart.
     *
     * <p>Checkout could only say "скидка применится на сервере" and show the pre-discount total,
     * so the customer confirmed one amount and got another. This computes the same discount the
     * order will use — read-only, and it does not consume a use or hold one.
     *
     * <p>Stays unauthenticated so the cart can answer while the Telegram sign-in is still in
     * flight; the authenticated {@code POST /api/me/promo/reserve} is what actually holds a
     * limited code.
     */
    @GetMapping("/promo-codes/preview")
    @Operation(summary = "Preview a promo code's discount for a subtotal")
    public PromoPreviewDto previewPromo(@RequestParam String code,
                                        @RequestParam long subtotalMinor,
                                        @RequestParam(required = false) String items) {
        // items: the cart's lines "id*qty,…" — a case code is counted without the low-margin products.
        return promoService.preview(code, subtotalMinor, null, com.maxsolch.shop.gift.CaseLowMargin.parseItems(items));
    }

    @GetMapping("/payment-options")
    @Operation(summary = "List active payment options (title/description translated for uk/en, ?lang= wins)")
    public List<PaymentOptionDto> paymentOptions(Locale locale) {
        TranslationService.Overlay overlay = translationService.overlay(ContentLocale.normalize(locale));
        return paymentOptions.active().stream().map(overlay::paymentOption).toList();
    }
}
