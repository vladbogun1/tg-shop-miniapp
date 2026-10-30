package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.payment.domain.PaymentError;
import com.maxsolch.shop.payment.domain.MonobankInvoiceStatus;
import com.maxsolch.shop.payment.domain.PaymentInvoice;
import com.maxsolch.shop.payment.domain.MonobankGateway;
import com.maxsolch.shop.payment.infra.PaymentInvoiceRepository;
import com.maxsolch.shop.order.domain.OrderMoney;

import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.payment.infra.PaymentProperties;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.platform.jobs.DbLocks;
import com.maxsolch.shop.journal.app.ActivityLog;
import com.maxsolch.shop.settings.app.SettingsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;


/**
 * Online payment of orders through monobank acquiring.
 *
 * <ul>
 *   <li>{@link #start} — gives the customer a payment page for what is due now (the whole order or
 *       the prepayment), reusing a live one.</li>
 *   <li>{@link #applyStatus} — the one place where a monobank status (webhook or poll) changes our
 *       data. Idempotent, ignores stale (out-of-order) states, credits a success exactly once and
 *       books refunds from {@code finalAmount}.</li>
 * </ul>
 * monobank is never called inside a database transaction.
 */
@Slf4j
@Service
public class OnlinePaymentService {

    /** Where the customer paid from — decides where the payment page sends them back. */
    public enum ReturnTo { SITE, MINIAPP }

    public record StartedPayment(String invoiceId, String pageUrl, long amountMinor, Instant expiresAt) {
    }

    private final MonobankGateway mono;
    private final PaymentInvoiceRepository invoices;
    private final OrderLookup orders;
    private final PaymentProperties props;
    private final Messages messages;
    private final TransactionTemplate tx;
    private final PaymentStatusApplier applier;
    /** PRRO tax codes for the basket. */
    private final SettingsService settings;
    /** «Журнал → Бот и сайт». */
    private final ActivityLog activity;
    private final Clock clock;
    private final PaymentReturnUrls urls;
    private static final String START_LOCK = "payment-start:";
    private static final java.time.Duration START_LOCK_TTL = java.time.Duration.ofMinutes(2);
    private static final java.time.Duration START_LOCK_WAIT = java.time.Duration.ofSeconds(30);
    private final DbLocks locks;

    public OnlinePaymentService(MonobankGateway mono, PaymentInvoiceRepository invoices, OrderLookup orders,
                                PaymentProperties props, Messages messages,
                                TransactionTemplate tx, PaymentStatusApplier applier,
                                SettingsService settings, ActivityLog activity, Clock clock, DbLocks locks) {
        this.locks = locks;
        this.mono = mono;
        this.invoices = invoices;
        this.orders = orders;
        this.props = props;
        this.urls = new PaymentReturnUrls(props);
        this.messages = messages;
        this.tx = tx;
        this.applier = applier;
        this.settings = settings;
        this.activity = activity;
        this.clock = clock;
    }

    private void journal(ActivityLog.Entry entry) {
        activity.record(entry);
    }

    public boolean isEnabled() {
        return mono.isEnabled();
    }

    /** Tax rate codes for every receipt line (setting payment.fiscalTaxCodes, e.g. "1" or "1,2"). */
    List<Integer> taxCodes() {
        String raw = settings.getString(PaymentSettings.PAYMENT_FISCAL_TAX_CODES);
        List<Integer> out = new ArrayList<>();
        if (raw != null) {
            for (String part : raw.split("[,;\\s]+")) {
                if (!part.isBlank()) {
                    try {
                        out.add(Integer.parseInt(part.trim()));
                    } catch (NumberFormatException e) {
                        log.warn("payment.fiscalTaxCodes: '{}' is not a number — ignored", part);
                    }
                }
            }
        }
        return out;
    }

    // ------------------------------------------------------------------ start

    public StartedPayment start(byte[] orderId, ReturnTo returnTo, String locale) {
        return start(orderId, returnTo, locale, false);
    }

    /**
     * @param embedded the page is shown inside our modal (iframe) instead of a redirect / new window
     */
    public StartedPayment start(byte[] orderId, ReturnTo returnTo, String locale, boolean embedded) {
        if (!mono.isEnabled()) {
            throw new DomainException.Conflict(PaymentError.PAYMENT_UNAVAILABLE);
        }
        String key = UuidUtil.toString(orderId);
        // One start per order at a time, across backend instances (double tap -> one invoice). The lock lives in the
        // database on its own, outside any transaction: the monobank call below must not run inside one.
        try (DbLocks.Held ignored = locks.lockWaiting(START_LOCK + key, START_LOCK_TTL, START_LOCK_WAIT)
                .orElseThrow(() -> new DomainException.Conflict(PaymentError.PAYMENT_UNAVAILABLE))) {
            return startLocked(orderId, returnTo, locale, embedded);
        }
    }

    private StartedPayment startLocked(byte[] orderId, ReturnTo returnTo, String locale, boolean embedded) {
        String display = embedded ? "iframe" : "page";
        Instant now = clock.instant();
        String key = UuidUtil.toString(orderId);
        Order order = orders.findWithItems(orderId)
                .orElseThrow(() -> new DomainException.BadRequest(PaymentError.ORDER_NOT_FOUND_CUSTOMER));
        if (order.getStatus() == OrderStatus.REJECTED
                && "PAYMENT_TIMEOUT".equals(order.getRejectReasonCode())) {
            throw new DomainException.Conflict(PaymentError.PAYMENT_EXPIRED);
        }
        long amount = OrderMoney.amountDueMinor(order);
        if (order.getStatus() == OrderStatus.REJECTED || order.getStatus() == OrderStatus.DELIVERED || amount <= 0) {
            throw new DomainException.Conflict(PaymentError.NOT_PAYABLE);
        }
        // The deadline binds a NEW order only (it is auto-cancelled after it). Once an admin approved the
        // order, the customer may pay late (they may have agreed in the chat) until the admin rejects it.
        // A paid order is never auto-cancelled, so a top-up for an added item has no deadline either.
        boolean deadlineApplies = order.getStatus() == OrderStatus.NEW && order.getPaymentDueAt() != null
                && !order.isPaid();
        if (deadlineApplies && !order.getPaymentDueAt().isAfter(now)) {
            throw new DomainException.Conflict(PaymentError.PAYMENT_EXPIRED);
        }

        Optional<StartedPayment> live = reuseLiveInvoice(orderId, amount, display, now);
        if (live.isPresent()) {
            return live.get();
        }

        Instant expiresAt = now.plus(Duration.ofMinutes(Math.max(5, props.getPayment().getInvoiceTtlMinutes())));
        if (deadlineApplies && order.getPaymentDueAt().isBefore(expiresAt)) {
            // monobank must not take money after we have cancelled the order.
            expiresAt = order.getPaymentDueAt();
        }
        long validity = Math.max(60, Duration.between(now, expiresAt).toSeconds());
        String shortId = key.substring(0, 8);
        List<MonobankGateway.BasketItem> basket = PaymentBasket.of(order, amount, shortId, taxCodes());
        MonobankGateway.CreatedInvoice created = createInvoice(new MonobankGateway.CreateInvoice(
                amount,
                key,
                "Оплата замовлення #" + shortId + " — ChiSetup",
                basket,
                urls.redirectUrl(order, returnTo, locale, embedded),
                urls.webhookUrl(),
                validity,
                embedded), orderId, returnTo);
        PaymentInvoice inv = PaymentInvoice.open(orderId, created.invoiceId(), amount, created.pageUrl(), display,
                PaymentBasket.toJson(basket), now.plusSeconds(validity));
        invoices.save(inv);
        log.info("monobank invoice {} for order {}: {} kop", created.invoiceId(), key, amount);
        journal(ActivityLog.Entry.of(ActivityLog.PAYMENT,
                        "INVOICE_CREATED").order(orderId)
                .text("Счёт monobank на " + MoneyFormat.amount(amount) + " грн"
                        + (amount < order.getTotalMinor() ? " (предоплата)" : "")
                        + " · " + (returnTo == ReturnTo.SITE ? "сайт" : "Mini App")
                        + (embedded ? ", в окне" : ""))
                .detail("invoice", created.invoiceId())
                .detail("amountMinor", amount)
                .detail("returnTo", returnTo)
                .detail("display", display)
                .detail("expiresAt", inv.getExpiresAt()));
        return new StartedPayment(inv.getExternalId(), inv.getPageUrl(), amount, inv.getExpiresAt());
    }

    /**
     * A live page of the order for the same amount and display, if there is one; otherwise the outdated pages (other
     * amount / about to expire) are closed so nobody pays twice. A payment the bank is processing blocks a new one.
     */
    private Optional<StartedPayment> reuseLiveInvoice(byte[] orderId, long amount, String display, Instant now) {
        List<PaymentInvoice> existing = invoices.findByOrderIdOrderByCreatedAtDesc(orderId);
        for (PaymentInvoice inv : existing) {
            if (PaymentInvoice.PROCESSING.equals(inv.getStatus()) || PaymentInvoice.HOLD.equals(inv.getStatus())) {
                throw new DomainException.Conflict(PaymentError.PAYMENT_IN_PROGRESS);
            }
            if (inv.isPayable(now) && inv.getAmountMinor() == amount && display.equals(inv.getDisplayType())) {
                return Optional.of(new StartedPayment(inv.getExternalId(), inv.getPageUrl(), inv.getAmountMinor(),
                        inv.getExpiresAt()));
            }
        }
        for (PaymentInvoice inv : existing) {
            if (PaymentInvoice.CREATED.equals(inv.getStatus())) {
                removeQuietly(inv);
            }
        }
        return Optional.empty();
    }

    /** monobank asked for the invoice; a refusal is journalled and turns into PAYMENT_FAILED. */
    private MonobankGateway.CreatedInvoice createInvoice(MonobankGateway.CreateInvoice request, byte[] orderId,
                                                         ReturnTo returnTo) {
        long amount = request.amount();
        MonobankGateway.CreatedInvoice created;
        try {
            created = mono.createInvoice(request);
        } catch (MonobankGateway.MonobankException e) {
            log.warn("monobank invoice/create failed for order {}: {}", request.reference(), e.getMessage());
            journal(ActivityLog.Entry.of(ActivityLog.PAYMENT,
                            "INVOICE_CREATE_FAILED").order(orderId)
                    .text("monobank не создал счёт на " + MoneyFormat.amount(amount) + " грн")
                    .detail("amountMinor", amount).detail("returnTo", returnTo)
                    .failed("MONOBANK_ERROR", e.getMessage()));
            throw new DomainException.Conflict(PaymentError.PAYMENT_FAILED);
        }
        if (created.invoiceId() == null || created.pageUrl() == null) {
            throw new DomainException.Conflict(PaymentError.PAYMENT_FAILED);
        }
        return created;
    }

    /**
     * Items of a refund, for the return receipt: a full refund returns exactly the lines sold; a
     * partial one is a single line for the amount.
     */
    List<MonobankGateway.BasketItem> refundItems(PaymentInvoice inv, long amount, boolean full) {
        if (full && inv.getBasketJson() != null) {
            try {
                List<MonobankGateway.BasketItem> sold = PaymentBasket.read(inv.getBasketJson());
                if (!sold.isEmpty()) {
                    return sold;
                }
            } catch (Exception e) {
                log.warn("invoice {}: unreadable basket_json — refunding as one line", inv.getExternalId());
            }
        }
        String shortId = UuidUtil.toString(inv.getOrderId()).substring(0, 8);
        return List.of(new MonobankGateway.BasketItem("Повернення за замовлення #" + shortId, 1, amount,
                "order-" + shortId, taxCodes()));
    }

    // ------------------------------------------------------------------ status

    /** Applies a monobank state (webhook body or poll) — see {@link PaymentStatusApplier}. */
    public boolean applyStatus(MonobankInvoiceStatus st) {
        return applier.apply(st);
    }

    /** Polls monobank for one invoice and applies the answer. */
    public void refresh(PaymentInvoice inv) {
        try {
            applyStatus(mono.status(inv.getExternalId()));
        } catch (MonobankGateway.MonobankException e) {
            log.warn("monobank status {} failed: {}", inv.getExternalId(), e.getMessage());
        }
    }

    /** Polls every invoice of the order whose status may still change. */
    public void refreshOrder(byte[] orderId) {
        if (!mono.isEnabled()) {
            return;
        }
        for (PaymentInvoice inv : invoices.findByOrderIdOrderByCreatedAtDesc(orderId)) {
            if (inv.isOpen() || inv.getRefundPendingUntil() != null) {
                refresh(inv);
            }
        }
    }

    // ------------------------------------------------------------------ refund / close

    /**
     * Admin refund of a paid invoice — {@code amountMinor} null = everything that is left. The
     * money is booked when monobank confirms it (status poll / webhook via {@link #applyStatus}).
     */
    public void refund(byte[] orderId, String invoiceId, Long amountMinor) {
        PaymentInvoice inv = invoices.findByProviderAndExternalId(PaymentInvoice.PROVIDER_MONOBANK, invoiceId)
                .filter(i -> java.util.Arrays.equals(i.getOrderId(), orderId))
                .orElseThrow(() -> new DomainException.BadRequest(PaymentError.INVOICE_NOT_FOUND));
        if (inv.getAppliedAt() == null) {
            throw new DomainException.BadRequest(PaymentError.INVOICE_NOT_PAID);
        }
        long left = inv.getAmountMinor() - inv.getRefundedMinor();
        if (amountMinor != null && (amountMinor <= 0 || amountMinor > left)) {
            throw new DomainException.BadRequest(PaymentError.REFUND_AMOUNT_OUT_OF_RANGE, MoneyFormat.uah(left));
        }
        if (left <= 0) {
            throw new DomainException.BadRequest(PaymentError.ALREADY_REFUNDED);
        }
        String extRef = "refund-" + UuidUtil.toString(UuidUtil.randomBytes()).substring(0, 13);
        try {
            boolean full = amountMinor == null || amountMinor == left;
            // A full refund of an untouched invoice returns the sold lines; anything else is one line.
            boolean asSold = full && inv.getRefundedMinor() == 0;
            mono.cancel(inv.getExternalId(), extRef, full ? null : amountMinor,
                    refundItems(inv, full ? left : amountMinor, asSold));
        } catch (MonobankGateway.MonobankException e) {
            throw new DomainException.BadRequest(PaymentError.MONO_REFUND_REJECTED, e.getMessage());
        }
        tx.executeWithoutResult(s -> invoices.findForUpdate(PaymentInvoice.PROVIDER_MONOBANK, invoiceId)
                .ifPresent(i -> {
                    i.awaitRefundUntil(clock.instant().plus(Duration.ofDays(2)));
                    invoices.save(i);
                }));
        refresh(inv);
    }

    /**
     * The paid invoice of the order that can take a refund of {@code amountMinor} (newest first),
     * for the return wizard; a 400 naming what is refundable when none can.
     */
    public String refundableInvoice(byte[] orderId, long amountMinor) {
        List<PaymentInvoice> all = invoices.findByOrderIdOrderByCreatedAtDesc(orderId);
        if (all.stream().anyMatch(i -> i.getRefundPendingUntil() != null && i.getRefundPendingUntil().isAfter(clock.instant()))) {
            // Not booked as refunded until the bank confirms: a second wizard now could return it twice.
            throw new DomainException.BadRequest(PaymentError.MONO_REFUND_PENDING);
        }
        List<PaymentInvoice> paid = all.stream()
                .filter(i -> i.getAppliedAt() != null)
                .toList();
        long most = paid.stream().mapToLong(i -> i.getAmountMinor() - i.getRefundedMinor()).max().orElse(0);
        return paid.stream()
                .filter(i -> i.getAmountMinor() - i.getRefundedMinor() >= amountMinor)
                .map(PaymentInvoice::getExternalId)
                .findFirst()
                .orElseThrow(() -> (most <= 0 ? new DomainException.BadRequest(PaymentError.MONO_NOTHING_TO_REFUND) : new DomainException.BadRequest(PaymentError.MONO_REFUND_LIMIT, MoneyFormat.uah(most))));
    }

    /** Closes the payment pages of an order that will not be paid any more (cancelled). */
    public void closeOpenInvoices(byte[] orderId) {
        if (!mono.isEnabled()) {
            return;
        }
        for (PaymentInvoice inv : invoices.findByOrderIdOrderByCreatedAtDesc(orderId)) {
            if (PaymentInvoice.CREATED.equals(inv.getStatus())) {
                removeQuietly(inv);
            }
        }
    }

    private void removeQuietly(PaymentInvoice inv) {
        try {
            mono.remove(inv.getExternalId());
        } catch (MonobankGateway.MonobankException e) {
            log.debug("monobank remove {} failed: {}", inv.getExternalId(), e.getMessage());
        }
        // Re-read the real state: if it was paid a second ago, that must still be credited.
        refresh(inv);
    }

    /** Is there a payment the bank is still processing (do not cancel the order under it)? */
    public boolean hasPaymentInFlight(byte[] orderId) {
        return invoices.findByOrderIdOrderByCreatedAtDesc(orderId).stream()
                .anyMatch(i -> PaymentInvoice.PROCESSING.equals(i.getStatus()) || PaymentInvoice.HOLD.equals(i.getStatus()));
    }
}
