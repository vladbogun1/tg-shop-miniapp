package com.maxsolch.shop.order.app;

import com.maxsolch.shop.preorder.app.PreorderSettings;
import com.maxsolch.shop.catalog.app.CatalogNames;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.order.infra.OrderGuardStore;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.settings.app.SettingsService;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Anti-bot / anti-hoarding limits on placing an order (group «Защита от ботов и спама» in the admin
 * settings, every limit: 0 = off). Checked by {@code OrderController} before {@link com.maxsolch.shop.order.app.Checkout#createOrder}.
 *
 * <p>Error codes (stable, the apps branch on them):
 * <ul>
 *   <li>400 {@link #QTY_LIMIT} — too many units of one product (variant) or in total;</li>
 *   <li>400 {@link #TOO_MANY_UNPAID} — the customer already has that many unpaid orders;</li>
 *   <li>429 {@link #ORDER_COOLDOWN}, {@link #ORDER_DAILY_LIMIT}, {@link #CANCEL_LIMIT} — with
 *       {@code Retry-After}.</li>
 * </ul>
 * Not under a lock: two checkouts racing in the same second may both pass — the IP bucket and the
 * cooldown make that window tiny, and this is a brake on bots, not an accounting rule.
 */
@Service
public class OrderGuard {


    static final Duration DAY = Duration.ofHours(24);

    private final SettingsService settings;
    private final OrderGuardStore store;
    private final CatalogNames catalog;
    private final Messages messages;
    private final Clock clock;

    OrderGuard(SettingsService settings, OrderGuardStore store, CatalogNames catalog, Messages messages, Clock clock) {
        this.catalog = catalog;
        this.settings = settings;
        this.store = store;
        this.messages = messages;
        this.clock = clock;
    }

    /** The limits as the apps need them (steppers in the cart, hints). */
    public record Limits(int maxQtyPerProduct, int maxUnitsPerOrder, int maxUnpaidOrders, int orderCooldownSec,
                         int maxOrdersPerDay, int maxSelfCancelsPerDay) {
    }

    public Limits limits() {
        return new Limits(
                settings.getInt(PreorderSettings.ANTIBOT_MAX_QTY_PER_PRODUCT),
                settings.getInt(AntibotSettings.ANTIBOT_MAX_UNITS_PER_ORDER),
                settings.getInt(AntibotSettings.ANTIBOT_MAX_UNPAID_ORDERS),
                settings.getInt(AntibotSettings.ANTIBOT_ORDER_COOLDOWN_SEC),
                settings.getInt(AntibotSettings.ANTIBOT_MAX_ORDERS_PER_DAY),
                settings.getInt(AntibotSettings.ANTIBOT_MAX_SELF_CANCELS_PER_DAY));
    }

    /** Throws when this customer may not place this order now. */
    public void check(long userId, List<CreateOrderCommand.Line> lines) {
        Limits l = limits();
        checkQuantities(l, lines);

        Instant now = clock.instant();
        Instant dayAgo = now.minus(DAY);

        if (l.maxSelfCancelsPerDay() > 0) {
            List<Instant> cancels = store.selfCancelsSince(userId, dayAgo);
            if (cancels.size() >= l.maxSelfCancelsPerDay()) {
                throw new DomainException.TooManyRequests(OrderError.CANCEL_LIMIT, retryAfter(cancels, l.maxSelfCancelsPerDay(), now), cancels.size());
            }
        }
        if (l.maxUnpaidOrders() > 0) {
            int unpaid = store.countUnpaid(userId);
            if (unpaid >= l.maxUnpaidOrders()) {
                throw new DomainException.BadRequest(OrderError.TOO_MANY_UNPAID, unpaid);
            }
        }
        boolean needHistory = l.orderCooldownSec() > 0 || l.maxOrdersPerDay() > 0;
        if (needHistory) {
            List<Instant> created = store.createdSince(userId, dayAgo);
            if (l.orderCooldownSec() > 0 && !created.isEmpty()) {
                Instant last = created.get(created.size() - 1);
                long wait = Duration.between(now, last.plusSeconds(l.orderCooldownSec())).toSeconds();
                if (wait > 0) {
                    throw new DomainException.TooManyRequests(OrderError.ORDER_COOLDOWN, wait, wait);
                }
            }
            if (l.maxOrdersPerDay() > 0 && created.size() >= l.maxOrdersPerDay()) {
                throw new DomainException.TooManyRequests(OrderError.ORDER_DAILY_LIMIT, retryAfter(created, l.maxOrdersPerDay(), now), created.size());
            }
        }
    }

    private void checkQuantities(Limits l, List<CreateOrderCommand.Line> lines) {
        if (lines == null) {
            return;
        }
        Map<String, Integer> perLine = new LinkedHashMap<>();
        Map<String, String> productOf = new LinkedHashMap<>();
        long units = 0;
        for (CreateOrderCommand.Line line : lines) {
            int q = Math.max(0, line.quantity());
            String key = line.productId() + "::" + (line.variantId() == null ? "" : line.variantId());
            perLine.merge(key, q, Integer::sum);
            productOf.put(key, line.productId());
            units += q;
        }
        if (l.maxQtyPerProduct() > 0) {
            for (Map.Entry<String, Integer> e : perLine.entrySet()) {
                if (e.getValue() > l.maxQtyPerProduct()) {
                    throw new DomainException.BadRequest(OrderError.QTY_LIMIT, l.maxQtyPerProduct(), catalog.titleOrId(productOf.get(e.getKey())));
                }
            }
        }
        if (l.maxUnitsPerOrder() > 0 && units > l.maxUnitsPerOrder()) {
            throw new DomainException.BadRequest(OrderError.QTY_LIMIT_UNITS, l.maxUnitsPerOrder());
        }
    }

    /**
     * Seconds until the oldest event that keeps the count at the limit leaves the 24-hour window
     * ({@code times} oldest first, {@code times.size() >= max}).
     */
    static long retryAfter(List<Instant> times, int max, Instant now) {
        Instant drops = times.get(times.size() - max).plus(DAY);
        return Math.max(1, Duration.between(now, drops).toSeconds());
    }
}
