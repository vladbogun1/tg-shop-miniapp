package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.DeliveryError;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.jobs.DbLocks;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Optional;
import java.util.function.Supplier;

/**
 * One waybill action per order at a time, across every backend instance (a zero-downtime release runs two): the
 * database lock {@code np-ttn:<order id>}. The caller re-reads the active waybill inside it, and no database
 * transaction is open while NP answers. A second request for the same order is refused ({@code NP_TTN_BUSY}).
 */
@Component
class ShipmentLocks {

    /** Longer than the slowest NP write plus our saves; released at once when done. */
    private static final Duration AT_MOST = Duration.ofMinutes(2);

    private final DbLocks locks;

    ShipmentLocks(DbLocks locks) {
        this.locks = locks;
    }

    static String name(byte[] orderId) {
        return "np-ttn:" + UuidUtil.toString(orderId);
    }

    <T> T withOrder(byte[] orderId, Supplier<T> action) {
        try (DbLocks.Held ignored = locks.tryLock(name(orderId), AT_MOST)
                .orElseThrow(() -> new DomainException.BadRequest(DeliveryError.NP_TTN_BUSY))) {
            return action.get();
        }
    }

    /**
     * Background work (clean-up, a typed-in number): empty when someone holds the order's lock — the caller leaves
     * it for the next {@link ShipmentJobs} tick instead of reporting a failure. The lock is not re-entrant.
     */
    <T> Optional<T> tryWithOrder(byte[] orderId, Supplier<T> action) {
        Optional<DbLocks.Held> held = locks.tryLock(name(orderId), AT_MOST);
        if (held.isEmpty()) {
            return Optional.empty();
        }
        try (DbLocks.Held ignored = held.get()) {
            return Optional.ofNullable(action.get());
        }
    }
}
