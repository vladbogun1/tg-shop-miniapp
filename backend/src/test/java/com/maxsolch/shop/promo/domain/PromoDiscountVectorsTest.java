package com.maxsolch.shop.promo.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

import java.io.InputStream;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The discount formula against {@code promo/discount-vectors.json}: percent, fixed amount, the
 * {@code max_discount_minor} ceiling, the low-margin («Упор на скидки») part, review bonus, gift codes.
 * The admin's mirror of the formula (frontend-admin, discount.test.ts) runs the same file.
 */
class PromoDiscountVectorsTest {

    @TestFactory
    Stream<DynamicTest> discountVectors() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/promo/discount-vectors.json")) {
            JsonNode cases = new ObjectMapper().readTree(in).get("cases");
            return Stream.iterate(0, i -> i + 1).limit(cases.size()).map(cases::get).map(c ->
                    DynamicTest.dynamicTest(c.get("name").asText(), () -> {
                        PromoCode promo = new PromoCode();
                        promo.setDiscountPercent(c.path("percent").asInt(0));
                        promo.setDiscountAmountMinor(c.path("amountMinor").asLong(0));
                        promo.setMaxDiscountMinor(c.path("maxMinor").asLong(0));
                        long discount = PromoDiscount.discountFor(
                                promo, c.get("subtotalMinor").asLong(), c.path("excludedMinor").asLong(0));
                        assertThat(discount).isEqualTo(c.get("expected").asLong());
                    })).toList().stream();
        }
    }
}
