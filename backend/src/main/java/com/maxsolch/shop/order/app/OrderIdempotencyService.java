package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.order.infra.OrderIdempotencyStore;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

/**
 * Stops one checkout from becoming two orders.
 *
 * <p>The client sends an {@code Idempotency-Key} it generates once per checkout attempt (double tap, lost
 * response, automatic retry). The key is a row of {@code order_idempotency} with a unique {@code (user_id, idem_key)}:
 * {@link #claim} inserts it in the same transaction as the order, so a second request with the same key
 * waits on the unique index until the first one commits (then it is refused with {@link AlreadyClaimed} and
 * reads the order back) or rolls back (then it proceeds). Unlike the in-memory cache it replaced, this holds
 * for parallel requests and survives a restart of the container.
 */
@Service
public class OrderIdempotencyService {

    private static final int MAX_KEY = 128;

    /** Another request holds (or has committed) this key; 409 if it ever reaches the customer. */
    public static final class AlreadyClaimed extends DomainException.Conflict {
        public AlreadyClaimed() {
            super(OrderError.IDEMPOTENCY_KEY_BUSY);
        }
    }

    private final OrderIdempotencyStore store;
    private final Clock clock;

    public OrderIdempotencyService(OrderIdempotencyStore store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    /** The key as stored (trimmed, at most 128 chars), or null when the request has none. */
    public static String normalize(String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            return null;
        }
        String trimmed = idempotencyKey.trim();
        return trimmed.length() > MAX_KEY ? trimmed.substring(0, MAX_KEY) : trimmed;
    }

    /** @return the order id (UUID string) created earlier under this key, or null if there is none yet */
    public String previousOrderId(long userId, String idempotencyKey) {
        String key = normalize(idempotencyKey);
        if (key == null) {
            return null;
        }
        List<byte[]> ids = store.orderIdsOf(userId, key);
        return ids.isEmpty() ? null : UuidUtil.toString(ids.get(0));
    }

    /**
     * Takes the key inside the caller's transaction.
     *
     * @throws AlreadyClaimed when a committed row with the key exists (the caller rolls back and reads it)
     */
    public void claim(long userId, String normalizedKey) {
        try {
            store.insert(userId, normalizedKey, clock.instant());
        } catch (DuplicateKeyException e) {
            throw new AlreadyClaimed();
        }
    }

    /** Points the claimed key at the order, in the same transaction. */
    public void attach(long userId, String normalizedKey, byte[] orderId) {
        store.attach(userId, normalizedKey, orderId);
    }

    /** Keys older than {@code before}: a retry of a single checkout never comes that late. */
    public int deleteOlderThan(Instant before) {
        return store.deleteOlderThan(before);
    }
}
