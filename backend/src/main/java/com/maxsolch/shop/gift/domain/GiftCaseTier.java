package com.maxsolch.shop.gift.domain;


import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * A gift case tier (V57): bronze / silver / gold, each with its own order-sum threshold and prizes.
 * The order gets the dearest tier it reaches. Before checkout the customer may take the tier's
 * guaranteed discount instead of the case ({@code guaranteedPercent} &gt; 0, capped by
 * {@code guaranteedMaxUah}); a prize similar to what they bought may be swapped for
 * {@code swapPercent} % of its price as a promo code.
 */
@Getter
@Setter
@Entity
@Table(name = "gift_case_tiers")
public class GiftCaseTier {

    /** Cheapest first. */
    public enum Tier { BRONZE, SILVER, GOLD }

    @Id
    @Enumerated(EnumType.STRING)
    @Column(name = "tier", length = 8)
    private Tier tier;

    @Column(name = "enabled", nullable = false)
    private boolean enabled = true;

    @Column(name = "threshold_uah", nullable = false)
    private int thresholdUah;

    /** Guaranteed discount on this order instead of the case, %; 0 = no choice, always the case. */
    @Column(name = "guaranteed_percent", nullable = false)
    private int guaranteedPercent = 0;

    /** Cap of the guaranteed discount, ₴; 0 = no cap. */
    @Column(name = "guaranteed_max_uah", nullable = false)
    private int guaranteedMaxUah = 0;

    /** A similar prize may be swapped for this % of its price (a promo code); 0 = no swap. */
    @Column(name = "swap_percent", nullable = false)
    private int swapPercent = 0;

    /** Days a personal code of this tier's case is valid (a discount prize, a swap), from issue. */
    @Column(name = "promo_valid_days", nullable = false)
    private int promoValidDays = 30;

    /**
     * An order with a low-margin product ({@code CaseLowMargin}): all product prizes together get this %
     * of the chance, discount prizes share the rest (V60). 100 = the usual odds.
     */
    @Column(name = "low_margin_product_percent", nullable = false)
    private int lowMarginProductPercent = 10;

    public long thresholdMinor() {
        return thresholdUah * 100L;
    }

    /** The guaranteed discount for an order total (minor units): whole hryvnias, within the cap. */
    public long guaranteedDiscountMinor(long totalMinor) {
        return guaranteedDiscountMinor(guaranteedPercent, guaranteedMaxUah, totalMinor);
    }

    public static long guaranteedDiscountMinor(int percent, int maxUah, long totalMinor) {
        if (percent <= 0 || totalMinor <= 0) {
            return 0;
        }
        long d = totalMinor * Math.min(100, percent) / 100 / 100 * 100;
        if (maxUah > 0) {
            d = Math.min(d, maxUah * 100L);
        }
        return Math.max(0, Math.min(d, totalMinor));
    }

    /** What a swap of a prize worth {@code priceMinor} gives: whole hryvnias, 0 = no swap. */
    public long swapAmountMinor(long priceMinor) {
        if (swapPercent <= 0 || priceMinor <= 0) {
            return 0;
        }
        return priceMinor * Math.min(100, swapPercent) / 100 / 100 * 100;
    }
}
