package com.maxsolch.shop.order.app;

import com.maxsolch.shop.platform.cache.CacheConfig;
import org.junit.jupiter.api.Test;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;

import static org.assertj.core.api.Assertions.assertThat;

/** Repeating a checkout under the same key gets the first order back; keys are per user. */
class OrderIdempotencyServiceTest {

    private final OrderIdempotencyService service =
            new OrderIdempotencyService(new ConcurrentMapCacheManager(CacheConfig.ORDER_IDEMPOTENCY));

    @Test
    void sameUserAndKeyGetTheRememberedOrder() {
        service.remember(1L, "k1", "order-1");

        assertThat(service.previousOrderId(1L, " k1 ")).isEqualTo("order-1");
    }

    @Test
    void anotherUserDoesNotSeeTheKey() {
        service.remember(1L, "k1", "order-1");

        assertThat(service.previousOrderId(2L, "k1")).isNull();
    }

    @Test
    void blankKeyIsNeverRemembered() {
        service.remember(1L, " ", "order-1");

        assertThat(service.previousOrderId(1L, " ")).isNull();
        assertThat(service.previousOrderId(1L, null)).isNull();
    }
}
