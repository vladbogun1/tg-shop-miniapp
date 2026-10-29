package com.maxsolch.shop.payment.app;

import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The customer's «check my payment now» (after coming back from the monobank page), with a brake:
 * at most one call to the bank per order every 5 seconds, however often the app asks.
 *
 * <p>The brake is in memory of this backend instance and keyed by the id exactly as it came in the
 * URL. When the table grows past 10 000 orders it is simply emptied.
 */
@Service
public class CustomerPaymentRefresh {

    private static final long MIN_SECONDS_BETWEEN_CALLS = 5;
    private static final int MAX_TRACKED_ORDERS = 10_000;

    private final OnlinePaymentService payments;
    private final Clock clock;
    /** Last customer-triggered status poll per order. */
    private final Map<String, Instant> lastRefresh = new ConcurrentHashMap<>();

    public CustomerPaymentRefresh(OnlinePaymentService payments, Clock clock) {
        this.payments = payments;
        this.clock = clock;
    }

    /** Polls monobank for the order unless it was polled less than 5 s ago. */
    public void refreshIfDue(String key, byte[] orderId) {
        Instant now = clock.instant();
        Instant last = lastRefresh.get(key);
        if (last == null || last.plusSeconds(MIN_SECONDS_BETWEEN_CALLS).isBefore(now)) {
            lastRefresh.put(key, now);
            if (lastRefresh.size() > MAX_TRACKED_ORDERS) {
                lastRefresh.clear();
            }
            payments.refreshOrder(orderId);
        }
    }
}
