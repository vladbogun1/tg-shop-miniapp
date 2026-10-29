package com.maxsolch.shop.order.domain;

import java.time.Instant;

/**
 * Why and when an order is rejected: what the paths to REJECTED (customer cancel, approved cancel request,
 * admin reject, payment timeout) write on the order. The paths differ in what they do BEFORE the reject
 * (stock, money, the cancel request), not in this part.
 *
 * @param cancelledByCustomer set the flag; {@code false} leaves it as it is (never true before a reject)
 */
public record RejectCause(Instant at, String reason, String reasonCode, boolean cancelledByCustomer) {
}
