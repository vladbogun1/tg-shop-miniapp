package com.maxsolch.shop.order.app;

import com.maxsolch.shop.journal.app.ActivityLog;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.settings.app.SettingsService;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/**
 * «Оплата при отриманні» holds stock without any money: a NEW such order nobody approved within
 * {@code payment.onDeliveryHoldHours} is cancelled and its goods go back on the shelf (0 = never). One order failing
 * is logged and skipped; the next run tries it again.
 */
@Slf4j
@Component
public class OnDeliveryHoldJobs {

    private final OrderRepository orders;
    private final OrderLifecycle lifecycle;
    private final SettingsService settings;
    private final ActivityLog activity;
    private final Clock clock;

    public OnDeliveryHoldJobs(OrderRepository orders, OrderLifecycle lifecycle, SettingsService settings,
                              ActivityLog activity, Clock clock) {
        this.orders = orders;
        this.lifecycle = lifecycle;
        this.settings = settings;
        this.activity = activity;
        this.clock = clock;
    }

    @SchedulerLock(name = "OnDeliveryHoldJobs.run", lockAtMostFor = "PT15M", lockAtLeastFor = "PT5S")
    @Scheduled(fixedDelayString = "${app.payment.reconcile-ms:120000}", initialDelay = 120_000)
    public void run() {
        int hours = settings.get(CheckoutSettings.ON_DELIVERY_HOLD_HOURS, 48);
        if (hours <= 0) {
            return;
        }
        Instant now = clock.instant();
        for (byte[] orderId : orders.findStaleOnDeliveryIds(now.minus(Duration.ofHours(hours)))) {
            expire(orderId, now, hours);
        }
    }

    private void expire(byte[] orderId, Instant now, int hours) {
        String id = UuidUtil.toString(orderId);
        try {
            if (lifecycle.expireOnDeliveryHold(orderId, now) != null) {
                log.info("order {} rejected: pay-on-delivery not approved in {} h", id, hours);
                activity.record(ActivityLog.Entry.of(ActivityLog.SYSTEM, "ORDER_AUTO_CANCELLED")
                        .order(orderId)
                        .text("Заказ #" + id.substring(0, 8) + " с оплатой при получении автоматически отменён: "
                                + "не одобрен за " + hours + " ч, товар вернулся на склад"));
            }
        } catch (RuntimeException e) {
            log.warn("auto-cancel of pay-on-delivery order {} failed: {}", id, e.getMessage());
            activity.record(ActivityLog.Entry.of(ActivityLog.SYSTEM, "ORDER_AUTO_CANCELLED")
                    .order(orderId).text("Автоотмена неодобренного заказа «при получении» не удалась")
                    .failed("ERROR", e.getMessage()));
        }
    }
}
