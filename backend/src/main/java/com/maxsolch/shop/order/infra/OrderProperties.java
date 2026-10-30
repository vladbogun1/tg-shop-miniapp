package com.maxsolch.shop.order.infra;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * What the order module reads of {@code app.*}: the payment deadline of a new order.
 * Binds a part of the {@code app.*} tree; keys and environment names are the same as before the split. Other
 * modules bind their own part of the same tree.
 */
@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "app")
public class OrderProperties {

    private Payment payment = new Payment();

    @Getter
    @Setter
    public static class Payment {
        /** How long a new order may stay unpaid before it is rejected and restocked, hours. */
        private int dueHours = 24;
    }
}
