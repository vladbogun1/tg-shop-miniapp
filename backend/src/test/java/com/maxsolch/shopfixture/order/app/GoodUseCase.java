package com.maxsolch.shopfixture.order.app;

import java.time.Clock;
import java.time.Instant;

public class GoodUseCase {
    private final Clock clock;

    public GoodUseCase(Clock clock) {
        this.clock = clock;
    }

    public Instant when() {
        return Instant.now(clock);
    }
}
