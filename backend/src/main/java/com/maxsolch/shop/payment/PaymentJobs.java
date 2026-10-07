package com.maxsolch.shop.payment;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.service.OrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

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
    private final OrderService orderService;
    private final AtomicBoolean running = new AtomicBoolean();

    /** «Журнал → Бот и сайт» (optional). */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.maxsolch.shop.journal.ActivityLog activity;

    public PaymentJobs(OnlinePaymentService payments, PaymentInvoiceRepository invoices,
                       OrderRepository orders, OrderService orderService) {
        this.payments = payments;
        this.invoices = invoices;
        this.orders = orders;
        this.orderService = orderService;
    }

    @Scheduled(fixedDelayString = "${app.payment.reconcile-ms:120000}", initialDelay = 90_000)
    public void run() {
        if (!running.compareAndSet(false, true)) {
            return;
        }
        try {
            Instant now = Instant.now();
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
                if (orderService.expireUnpaid(orderId, now) != null) {
                    payments.closeOpenInvoices(orderId);
                    log.info("order {} rejected: not paid in time", id);
                    if (activity != null) {
                        activity.record(com.maxsolch.shop.journal.ActivityLog.Entry.of(
                                        com.maxsolch.shop.journal.ActivityLog.SYSTEM, "ORDER_AUTO_CANCELLED")
                                .order(orderId)
                                .text("Заказ #" + id.substring(0, 8) + " автоматически отменён: не оплачен вовремя, "
                                        + "товар вернулся на склад"));
                    }
                }
            } catch (Exception e) {
                log.warn("auto-cancel of order {} failed: {}", id, e.getMessage());
                if (activity != null) {
                    activity.record(com.maxsolch.shop.journal.ActivityLog.Entry.of(
                                    com.maxsolch.shop.journal.ActivityLog.SYSTEM, "ORDER_AUTO_CANCELLED")
                            .order(orderId).text("Автоотмена неоплаченного заказа не удалась")
                            .failed("ERROR", e.getMessage()));
                }
            }
        }
    }
}
