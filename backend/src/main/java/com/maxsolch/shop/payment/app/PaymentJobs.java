package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.payment.domain.PaymentInvoice;
import com.maxsolch.shop.payment.infra.PaymentInvoiceRepository;
import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.order.app.OrderLifecycle;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Background side of online payment, every couple of minutes:
 * <ol>
 *   <li>asks monobank about invoices still open — webhooks can be lost (3 attempts only, our
 *       restarts), and an expired invoice gets no webhook at all;</li>
 *   <li>follows requested refunds until they settle;</li>
 *   <li>rejects orders not paid within the deadline (24 h) and puts the goods back on the shelf.</li>
 * </ol>
 */
@Slf4j
@Component
public class PaymentJobs {

    /** Give the webhook a head start before polling a fresh invoice. */
    private static final Duration POLL_AFTER = Duration.ofMinutes(1);

    private final OnlinePaymentService payments;
    private final PaymentInvoiceRepository invoices;
    private final OrderRepository orders;
    private final OrderLifecycle lifecycle;
    private final AtomicBoolean running = new AtomicBoolean();

    /** «Журнал → Бот и сайт». */
    private final ActivityLog activity;
    private final Clock clock;

    public PaymentJobs(OnlinePaymentService payments, PaymentInvoiceRepository invoices,
                       OrderRepository orders, OrderLifecycle lifecycle, ActivityLog activity, Clock clock) {
        this.payments = payments;
        this.invoices = invoices;
        this.orders = orders;
        this.lifecycle = lifecycle;
        this.activity = activity;
        this.clock = clock;
    }

    @SchedulerLock(name = "PaymentJobs.run", lockAtMostFor = "PT15M", lockAtLeastFor = "PT5S")
    @Scheduled(fixedDelayString = "${app.payment.reconcile-ms:120000}", initialDelay = 90_000)
    public void run() {
        if (!running.compareAndSet(false, true)) {
            return;
        }
        try {
            Instant now = clock.instant();
            if (payments.isEnabled()) {
                for (PaymentInvoice inv : invoices.findOpenCreatedBefore(PaymentInvoice.OPEN, now.minus(POLL_AFTER))) {
                    payments.refresh(inv);
                }
                for (PaymentInvoice inv : invoices.findByRefundPendingUntilAfter(now)) {
                    payments.refresh(inv);
                }
            }
            cancelOverdue(now);
        } catch (Exception e) {
            log.warn("payment jobs failed: {}", e.getMessage(), e);
        } finally {
            running.set(false);
        }
    }

    private void cancelOverdue(Instant now) {
        for (byte[] orderId : orders.findOverdueUnpaidIds(now)) {
            String id = UuidUtil.toString(orderId);
            try {
                // Last word from the bank first: a payment made a minute before the deadline wins.
                payments.refreshOrder(orderId);
                if (payments.hasPaymentInFlight(orderId)) {
                    continue;
                }
                if (lifecycle.expireUnpaid(orderId, now) != null) {
                    payments.closeOpenInvoices(orderId);
                    log.info("order {} rejected: not paid in time", id);
                    {
                        activity.record(ActivityLog.Entry.of(
                                        ActivityLog.SYSTEM, "ORDER_AUTO_CANCELLED")
                                .order(orderId)
                                .text("Заказ #" + id.substring(0, 8) + " автоматически отменён: не оплачен вовремя, "
                                        + "товар вернулся на склад"));
                    }
                }
            } catch (Exception e) {
                log.warn("auto-cancel of order {} failed: {}", id, e.getMessage());
                {
                    activity.record(ActivityLog.Entry.of(
                                    ActivityLog.SYSTEM, "ORDER_AUTO_CANCELLED")
                            .order(orderId).text("Автоотмена неоплаченного заказа не удалась")
                            .failed("ERROR", e.getMessage()));
                }
            }
        }
    }
}
