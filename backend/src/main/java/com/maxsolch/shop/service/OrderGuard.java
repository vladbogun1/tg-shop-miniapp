package com.maxsolch.shop.service;

import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.TooManyRequestsException;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Anti-bot / anti-hoarding limits on placing an order (group «Защита от ботов и спама» in the admin
 * settings, every limit: 0 = off). Checked by {@code OrderController} before {@link OrderService#createOrder}.
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

    public static final String QTY_LIMIT = "QTY_LIMIT";
    public static final String TOO_MANY_UNPAID = "TOO_MANY_UNPAID";
    public static final String ORDER_COOLDOWN = "ORDER_COOLDOWN";
    public static final String ORDER_DAILY_LIMIT = "ORDER_DAILY_LIMIT";
    public static final String CANCEL_LIMIT = "CANCEL_LIMIT";

    static final Duration DAY = Duration.ofHours(24);

    private final SettingsService settings;
    private final OrderGuardStore store;
    private final Messages messages;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public OrderGuard(SettingsService settings, OrderGuardStore store, Messages messages) {
        this(settings, store, messages, Clock.systemUTC());
    }

    OrderGuard(SettingsService settings, OrderGuardStore store, Messages messages, Clock clock) {
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
                settings.getInt(SettingsRegistry.ANTIBOT_MAX_QTY_PER_PRODUCT),
                settings.getInt(SettingsRegistry.ANTIBOT_MAX_UNITS_PER_ORDER),
                settings.getInt(SettingsRegistry.ANTIBOT_MAX_UNPAID_ORDERS),
                settings.getInt(SettingsRegistry.ANTIBOT_ORDER_COOLDOWN_SEC),
                settings.getInt(SettingsRegistry.ANTIBOT_MAX_ORDERS_PER_DAY),
                settings.getInt(SettingsRegistry.ANTIBOT_MAX_SELF_CANCELS_PER_DAY));
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
                throw new TooManyRequestsException(
                        messages.current("api.antibot.cancelLimit", cancels.size()), CANCEL_LIMIT,
                        retryAfter(cancels, l.maxSelfCancelsPerDay(), now));
            }
        }
        if (l.maxUnpaidOrders() > 0) {
            int unpaid = store.countUnpaid(userId);
            if (unpaid >= l.maxUnpaidOrders()) {
                throw new BadRequestException(messages.current("api.antibot.tooManyUnpaid", unpaid), TOO_MANY_UNPAID);
            }
        }
        boolean needHistory = l.orderCooldownSec() > 0 || l.maxOrdersPerDay() > 0;
        if (needHistory) {
            List<Instant> created = store.createdSince(userId, dayAgo);
            if (l.orderCooldownSec() > 0 && !created.isEmpty()) {
                Instant last = created.get(created.size() - 1);
                long wait = Duration.between(now, last.plusSeconds(l.orderCooldownSec())).toSeconds();
                if (wait > 0) {
                    throw new TooManyRequestsException(messages.current("api.antibot.cooldown", wait),
                            ORDER_COOLDOWN, wait);
                }
            }
            if (l.maxOrdersPerDay() > 0 && created.size() >= l.maxOrdersPerDay()) {
                throw new TooManyRequestsException(
                        messages.current("api.antibot.dailyLimit", created.size()), ORDER_DAILY_LIMIT,
                        retryAfter(created, l.maxOrdersPerDay(), now));
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
                    throw new BadRequestException(messages.current("api.antibot.qtyLimit", l.maxQtyPerProduct(),
                            store.productTitle(productOf.get(e.getKey()))), QTY_LIMIT);
                }
            }
        }
        if (l.maxUnitsPerOrder() > 0 && units > l.maxUnitsPerOrder()) {
            throw new BadRequestException(messages.current("api.antibot.unitsLimit", l.maxUnitsPerOrder()), QTY_LIMIT);
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
