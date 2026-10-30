package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.payment.domain.PaymentInvoice;
import com.maxsolch.shop.payment.domain.ReceiptKind;
import com.maxsolch.shop.payment.domain.MonobankGateway;
import com.maxsolch.shop.payment.infra.PaymentInvoiceRepository;
import com.maxsolch.shop.payment.infra.ReceiptDeliveryStore;
import com.maxsolch.shop.platform.cache.CacheConfig;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.customer.app.Customers;
import com.maxsolch.shop.settings.app.SettingsService;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Sends the customer every payment receipt as a PDF in Telegram, exactly once.
 *
 * <p>The PRRO (Вчасно.Каса) issues the fiscal check seconds to minutes after the payment, and a
 * return check after a refund; monobank sends no webhook for that, so this job polls
 * {@code fiscal-checks} of the invoices paid or refunded in the last {@link #WINDOW} and sends each
 * check that reached {@code done}. A {@code failed} check is never sent; past the window an
 * invoice is no longer looked at. When no fiscal check exists {@link #BANK_FALLBACK_AFTER} after
 * the payment (fiscalisation is off), the bank's receipt goes out instead.
 *
 * <p>Exactly-once comes from {@link ReceiptDeliveryStore} (V46): claimed before the send, recorded
 * after. monobank and Telegram are called outside any DB transaction. Off with the
 * {@code payment.sendReceiptsToTelegram} setting.
 */
@Slf4j
@Component
public class ReceiptDeliveryJob {

    static final Duration WINDOW = Duration.ofHours(48);
    static final Duration BANK_FALLBACK_AFTER = Duration.ofMinutes(30);

    private final MonobankGateway mono;
    private final PaymentInvoiceRepository invoices;
    private final OrderLookup orders;
    private final Customers users;
    private final ReceiptDeliveryStore store;
    private final ReceiptService receipts;
    private final ReceiptNotifier notifications;
    private final SettingsService settings;
    private final Clock clock;
    private final AtomicBoolean running = new AtomicBoolean();

    /**
     * Invoices with every check final and handled → their refunded amount at that moment. Skipped
     * while it stays the same (a new refund brings a return check); rechecked every 15 min anyway
     * (the cache expires, see {@link CacheConfig#RECEIPT_DELIVERY_QUIET}).
     */
    private final Cache quiet;

    public ReceiptDeliveryJob(MonobankGateway mono, PaymentInvoiceRepository invoices, OrderLookup orders,
                              Customers users, ReceiptDeliveryStore store, ReceiptService receipts,
                              ReceiptNotifier notifications, SettingsService settings,
                              CacheManager caches, Clock clock) {
        this.quiet = java.util.Objects.requireNonNull(caches.getCache(CacheConfig.RECEIPT_DELIVERY_QUIET));
        this.clock = clock;
        this.mono = mono;
        this.invoices = invoices;
        this.orders = orders;
        this.users = users;
        this.store = store;
        this.receipts = receipts;
        this.notifications = notifications;
        this.settings = settings;
    }

    @SchedulerLock(name = "ReceiptDeliveryJob.run", lockAtMostFor = "PT15M", lockAtLeastFor = "PT5S")
    @Scheduled(fixedDelayString = "${app.payment.receipts-ms:90000}", initialDelay = 120_000)
    public void run() {
        if (!running.compareAndSet(false, true)) {
            return;
        }
        try {
            deliver(clock.instant());
        } catch (Exception e) {
            log.warn("receipt delivery failed: {}", e.getMessage(), e);
        } finally {
            running.set(false);
        }
    }

    void deliver(Instant now) {
        if (!mono.isEnabled() || !notifications.isBotEnabled()
                || !settings.getBool(PaymentSettings.PAYMENT_SEND_RECEIPTS_TO_TELEGRAM)) {
            return;
        }
        for (PaymentInvoice inv : invoices.findReceiptCandidates(now.minus(WINDOW))) {
            try {
                deliverInvoice(inv, now);
            } catch (Exception e) {
                log.warn("receipts of invoice {} failed: {}", inv.getExternalId(), e.getMessage());
            }
        }
    }

    void deliverInvoice(PaymentInvoice inv, Instant now) {
        Long refunded = quiet.get(inv.getExternalId(), Long.class);
        if (refunded != null && refunded == inv.getRefundedMinor()) {
            return;
        }
        Order order = orders.find(inv.getOrderId()).orElse(null);
        if (order == null || !reachable(order.getTgUserId())) {
            return;
        }
        Map<String, ReceiptKind> handled = store.handled(inv.getId());
        if (inv.getRefundedMinor() == 0 && handled.values().stream()
                .anyMatch(k -> k == ReceiptKind.FISCAL_SALE || k == ReceiptKind.BANK)) {
            // The sale receipt is out and nothing was refunded: nothing more will come.
            return;
        }

        List<MonobankGateway.FiscalCheck> checks;
        try {
            checks = mono.fiscalChecks(inv.getExternalId());
        } catch (Exception e) {
            // Not "no checks": never fall back to the bank receipt on an error.
            log.debug("fiscal checks of invoice {} failed: {}", inv.getExternalId(), e.getMessage());
            return;
        }
        receipts.remember(inv, checks);

        if (checks.isEmpty()) {
            if (handled.isEmpty() && inv.getAppliedAt().isBefore(now.minus(BANK_FALLBACK_AFTER))) {
                byte[] pdf;
                try {
                    pdf = mono.bankReceipt(inv.getExternalId());
                } catch (Exception e) {
                    log.debug("bank receipt of invoice {} failed: {}", inv.getExternalId(), e.getMessage());
                    return;
                }
                send(order, inv, "bank:" + UuidUtil.toString(inv.getId()), ReceiptKind.BANK, pdf, null, now);
            }
            return;
        }

        boolean allSettled = true;
        for (MonobankGateway.FiscalCheck c : checks) {
            if (c.id() == null || c.isFailed() || handled.containsKey(c.id())) {
                continue;
            }
            if (!c.isDone()) {
                allSettled = false;
                continue;
            }
            byte[] pdf = MonobankGateway.decodePdf(c.file());
            if (pdf == null) {
                // done, but the PDF is not attached yet — next run
                allSettled = false;
                continue;
            }
            if (!send(order, inv, c.id(), ReceiptKind.ofCheck(c), pdf, c.taxUrl(), now)) {
                allSettled = false;
            }
        }
        if (allSettled) {
            quiet.put(inv.getExternalId(), inv.getRefundedMinor());
        }
    }

    /** Claim → send → record. False when it must be tried again. */
    private boolean send(Order order, PaymentInvoice inv, String checkId, ReceiptKind kind, byte[] pdf,
                         String taxUrl, Instant now) {
        if (pdf == null || pdf.length == 0) {
            return false;
        }
        if (!store.claim(checkId, inv.getId(), inv.getOrderId(), kind, now)) {
            return true;
        }
        ReceiptNotifier.Delivery result = notifications.send(order, pdf, kind, taxUrl);
        switch (result) {
            case SENT -> {
                store.finish(checkId, ReceiptDeliveryStore.SENT);
                log.info("receipt {} ({}) of order {} sent to the customer", checkId, kind,
                        UuidUtil.toString(order.getId()));
                return true;
            }
            case BLOCKED -> {
                store.finish(checkId, ReceiptDeliveryStore.BLOCKED);
                try {
                    users.markBotBlocked(order.getTgUserId(), now);
                } catch (Exception ignore) {
                    // best-effort, as in BroadcastService
                }
                return true;
            }
            default -> {
                store.release(checkId);
                return false;
            }
        }
    }

    /** A Telegram account that has not blocked the bot. */
    private boolean reachable(Long tgUserId) {
        if (tgUserId == null || tgUserId <= 0) {
            return false;
        }
        return users.findById(tgUserId).map(u -> !u.isBotBlocked()).orElse(true);
    }
}
