package com.maxsolch.shop.order.app;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** The «проблемный покупатель» line on top of the seller's Telegram cards. */
class SellerCardsProblemWarningTest {

    @Test
    void markedBuyer_warningOnTop_reasonEscaped() {
        String card = SellerCards.withProblemWarning("CARD", "не забрал <наложку>");

        assertThat(card).startsWith("🚫 <b>ПРОБЛЕМНЫЙ ПОКУПАТЕЛЬ</b>: не забрал &lt;наложку&gt;\n")
                .contains("наложкой не отправлять")
                .endsWith("\n\nCARD");
    }

    @Test
    void unmarkedBuyer_cardUnchanged() {
        assertThat(SellerCards.withProblemWarning("CARD", null)).isEqualTo("CARD");
        assertThat(SellerCards.withProblemWarning("CARD", " ")).isEqualTo("CARD");
    }
}
