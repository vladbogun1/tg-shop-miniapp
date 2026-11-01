package com.maxsolch.shopfixture.order.app;

import java.time.Clock;
import java.time.Instant;

public class GoodUseCase {
    private final Clock clock;

    public GoodUseCase(Clock clock) {
        this.clock = clock;
    }

    /** The module's own scenario changes its entity by a method: not a violation. */
    public void settle(com.maxsolch.shopfixture.order.domain.Order order) {
        order.markPaid();
    }

    public Instant when() {
        return Instant.now(clock);
    }
}
