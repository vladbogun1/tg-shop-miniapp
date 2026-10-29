package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Wording of the money journal channels. */
class MoneyLedgerTest {

    @Test
    void channelLabel_hasAWordingForEveryChannel() {
        for (com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel c
                : com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.values()) {
            assertThat(MoneyLedger.channelLabel(c)).isNotBlank();
        }
        assertThat(MoneyLedger.channelLabel(com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.NP_COD))
                .isEqualTo("наложка НП");
        assertThat(MoneyLedger.channelLabel(com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.EXCHANGE))
                .isEqualTo("зачёт в обмен");
    }

}
