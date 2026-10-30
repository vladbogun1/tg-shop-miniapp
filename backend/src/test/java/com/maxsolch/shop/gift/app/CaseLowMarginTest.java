package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.gift.domain.GiftCaseItem;
import com.maxsolch.shop.gift.domain.GiftCaseTier;

import com.maxsolch.shop.promo.domain.PromoDiscount;
import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.order.app.OrderPromos;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.SplittableRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/** The case of an order with a low-margin product (docs/GIFT-CASE.md, «Товары с упором на скидки»). */
class CaseLowMarginTest {

    private static GiftService.CaseEntry product(long id, String productId, String rarity, int weight) {
        return new GiftService.CaseEntry(id, GiftCaseTier.Tier.SILVER, GiftCaseItem.Kind.PRODUCT, productId, 0, 0,
                rarity, weight);
    }

    private static GiftService.CaseEntry discount(long id, int uah, int weight) {
        return new GiftService.CaseEntry(id, GiftCaseTier.Tier.SILVER, GiftCaseItem.Kind.DISCOUNT, null, 0, uah,
                "RARE", weight);
    }

    /** 80 % products (the jackpot 1 %), 20 % discounts — a usual silver case. */
    private static final List<GiftService.CaseEntry> CASE = List.of(
            product(1, "pad", "COMMON", 600_000),
            product(2, "cable", "RARE", 190_000),
            product(3, "mouse", "GOLD", 10_000),
            discount(4, 100, 150_000),
            discount(5, 200, 50_000));

    private static Map<Long, Double> shares(int productPercent, int n, long seed) {
        var random = new SplittableRandom(seed);
        Map<Long, Integer> hits = new HashMap<>();
        for (int i = 0; i < n; i++) {
            hits.merge(GiftService.draw(CASE, id -> true, random, productPercent).orElseThrow().id(), 1, Integer::sum);
        }
        Map<Long, Double> out = new HashMap<>();
        hits.forEach((k, v) -> out.put(k, v / (double) n));
        return out;
    }

    @Test
    void productPrizesGetTheirShareAndKeepTheirRatios() {
        Map<Long, Double> s = shares(10, 200_000, 42);
        double products = s.getOrDefault(1L, 0.0) + s.getOrDefault(2L, 0.0) + s.getOrDefault(3L, 0.0);
        assertThat(products).isCloseTo(0.10, within(0.005));
        // Inside the products: 600 : 190 : 10, the jackpot is still the rarest.
        assertThat(s.get(1L) / products).isCloseTo(0.75, within(0.02));
        assertThat(s.getOrDefault(3L, 0.0)).isLessThan(s.get(2L));
        // Inside the discounts: 150 : 50.
        assertThat(s.get(4L) / (s.get(4L) + s.get(5L))).isCloseTo(0.75, within(0.01));
    }

    @Test
    void exactWeights() {
        long[] w = GiftService.skewedWeights(CASE, 10);
        long products = w[0] + w[1] + w[2];
        long discounts = w[3] + w[4];
        assertThat(products * 9).isEqualTo(discounts);
        assertThat(w[0] * 190).isEqualTo(w[1] * 600);
    }

    @Test
    void hundredOrOneSidedPoolIsUnchanged() {
        assertThat(GiftService.skewedWeights(CASE, 100)).containsExactly(600_000, 190_000, 10_000, 150_000, 50_000);
        List<GiftService.CaseEntry> onlyProducts = CASE.subList(0, 3);
        assertThat(GiftService.skewedWeights(onlyProducts, 10)).containsExactly(600_000, 190_000, 10_000);
        List<GiftService.CaseEntry> onlyDiscounts = CASE.subList(3, 5);
        assertThat(GiftService.skewedWeights(onlyDiscounts, 0)).containsExactly(150_000, 50_000);
    }

    @Test
    void zeroPercentNeverGivesAProduct() {
        var random = new SplittableRandom(5);
        for (int i = 0; i < 5000; i++) {
            assertThat(GiftService.draw(CASE, id -> true, random, 0).orElseThrow().isDiscount()).isTrue();
        }
    }

    @Test
    void outOfStockProductsStillLeaveTheShareToTheRest() {
        // Only the pad is in stock: it alone takes the products' 10 %.
        var random = new SplittableRandom(9);
        int pads = 0;
        int n = 100_000;
        for (int i = 0; i < n; i++) {
            if ("pad".equals(GiftService.draw(CASE, "pad"::equals, random, 10).orElseThrow().productId())) {
                pads++;
            }
        }
        assertThat(pads / (double) n).isCloseTo(0.10, within(0.005));
    }

    @Test
    void tierConfigShare() {
        var t = new GiftService.TierConfig(GiftCaseTier.Tier.SILVER, 300_000, 0, 0, 0, CASE, 15);
        assertThat(t.productPercent(true)).isEqualTo(15);
        assertThat(t.productPercent(false)).isEqualTo(100);
        assertThat(new GiftService.TierConfig(GiftCaseTier.Tier.SILVER, 300_000, 0, 0, 0, CASE).productPercent(true))
                .isEqualTo(100);
    }

    @Test
    void casePromoSkipsTheExcludedPart() {
        PromoCode percent = new PromoCode();
        percent.setDiscountPercent(10);
        // Mouse 4 000 ₴ (low-margin) + pad 800 ₴: 10 % of 800 only.
        assertThat(PromoDiscount.discountFor(percent, 480_000, 400_000)).isEqualTo(8_000);
        assertThat(PromoDiscount.discountFor(percent, 480_000)).isEqualTo(48_000);

        PromoCode fixed = new PromoCode();
        fixed.setDiscountAmountMinor(30_000);
        // −300 ₴ is capped at the 200 ₴ the code may touch.
        assertThat(PromoDiscount.discountFor(fixed, 420_000, 400_000)).isEqualTo(20_000);
        assertThat(PromoDiscount.discountFor(fixed, 480_000, 400_000)).isEqualTo(30_000);
        assertThat(PromoDiscount.discountFor(fixed, 400_000, 400_000)).isZero();
    }

    @Test
    void casePromoIsRecognisedBySource() {
        PromoCode p = new PromoCode();
        assertThat(OrderPromos.isCasePromo(p)).isFalse();
        p.setSource(GiftService.PROMO_SOURCE);
        assertThat(OrderPromos.isCasePromo(p)).isTrue();
    }

    @Test
    void parsesCartItems() {
        assertThat(CaseLowMargin.parseItems("A*1, b*2,a*3,,x,y*0,z*q")).containsExactlyInAnyOrderEntriesOf(
                Map.of("a", 4, "b", 2));
        assertThat(CaseLowMargin.parseItems(null)).isEmpty();
        assertThat(CaseLowMargin.parseItems(" ")).isEmpty();
    }
}
