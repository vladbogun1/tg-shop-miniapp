package com.maxsolch.shop.promo.app;

import com.maxsolch.shop.journal.app.ActivityLog;
import com.maxsolch.shop.platform.util.MoneyFormat;
import org.springframework.stereotype.Service;

import java.util.Locale;

/** The promo code typed in the cart: checked and held, and an accepted one is noted in the journal. */
@Service
public class CartPromo {

    private final PromoService promoService;
    private final ActivityLog activity;

    public CartPromo(PromoService promoService, ActivityLog activity) {
        this.promoService = promoService;
        this.activity = activity;
    }

    /** {@code items}: the cart's lines "id*qty,…" — a case code is counted without the low-margin products. */
    public PromoPreviewDto reserve(String code, long subtotalMinor, long userId, String items) {
        PromoPreviewDto preview = promoService.reserve(code, subtotalMinor, userId, CaseLowMargin.parseItems(items));
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
}
