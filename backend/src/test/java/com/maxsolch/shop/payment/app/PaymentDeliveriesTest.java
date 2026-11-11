package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.platform.error.DomainException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The deliveries a payment option is offered for, as the admin editor sends them. */
class PaymentDeliveriesTest {

    @Test
    void knownKeys_upperCased_deduplicated() {
        assertThat(PaymentDeliveries.normalize(" warehouse, POSTOMAT ,warehouse")).isEqualTo("WAREHOUSE,POSTOMAT");
    }

    @Test
    void blankOrAllFour_meanEverywhere() {
        assertThat(PaymentDeliveries.normalize(null)).isNull();
        assertThat(PaymentDeliveries.normalize(" ")).isNull();
        assertThat(PaymentDeliveries.normalize("PICKUP,DOORS,POSTOMAT,WAREHOUSE")).isNull();
    }

    @Test
    void unknownKey_orOnlyCommas_isRefused() {
        assertThatThrownBy(() -> PaymentDeliveries.normalize("WAREHOUSE,PIGEON"))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> PaymentDeliveries.normalize(" , ,"))
                .isInstanceOf(DomainException.BadRequest.class);
    }
}
