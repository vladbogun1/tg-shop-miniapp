package com.maxsolch.shop.order.domain;

import org.springframework.test.util.ReflectionTestUtils;

/**
 * Test-only way to put an {@link Order} or an {@link OrderItem} into an arbitrary state (a refunded sum with no
 * refund behind it, a status the machine would not reach). Production code cannot do this: the aggregates have no
 * setters, every change there goes through a method that keeps the invariants. Tests that check the behaviour use
 * the methods; tests that only need a fixture write the fields here.
 */
public final class OrderFixtures {

    private OrderFixtures() {
    }

    /** Writes the field {@code name} of the entity directly (primitives are widened: an int literal fits a long field). */
    public static void set(Object entity, String name, Object value) {
        ReflectionTestUtils.setField(entity, name, value);
    }
}
