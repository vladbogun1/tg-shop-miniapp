package com.maxsolch.shop.payment;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.service.OrderService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.ConflictException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

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

    private final MonobankClient mono;
    private final PaymentInvoiceRepository invoices;
    private final OrderRepository orders;
    private final OrderService orderService;
    private final AppProperties props;
    private final Messages messages;
    private final TransactionTemplate tx;
    private final PaymentStatusApplier applier;
    /** One start per order at a time (double tap → one invoice). Single backend instance. */
    private final Map<String, Object> startLocks = new ConcurrentHashMap<>();

    public OnlinePaymentService(MonobankClient mono, PaymentInvoiceRepository invoices, OrderRepository orders,
                                OrderService orderService, AppProperties props, Messages messages,
                                TransactionTemplate tx, PaymentStatusApplier applier) {
        this.mono = mono;
        this.invoices = invoices;
        this.orders = orders;
        this.orderService = orderService;
        this.props = props;
        this.messages = messages;
        this.tx = tx;
        this.applier = applier;
    }

    /** Optional (tests build the service without them): PRRO tax codes and basket JSON. */
    private com.maxsolch.shop.settings.SettingsService settings;
    private static final com.fasterxml.jackson.databind.ObjectMapper JSON = new com.fasterxml.jackson.databind.ObjectMapper();

    @org.springframework.beans.factory.annotation.Autowired
    void setSettings(com.maxsolch.shop.settings.SettingsService settings) {
        this.settings = settings;
    }

    public boolean isEnabled() {
        return mono.isEnabled();
    }

    /** Tax rate codes for every receipt line (setting payment.fiscalTaxCodes, e.g. "1" or "1,2"). */
    List<Integer> taxCodes() {
        if (settings == null) {
            return List.of();
        }
        String raw = settings.getString(com.maxsolch.shop.settings.SettingsRegistry.PAYMENT_FISCAL_TAX_CODES);
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
            throw new ConflictException(messages.current("api.payment.unavailable"), "PAYMENT_UNAVAILABLE");
        }
        String key = UuidUtil.toString(orderId);
        Object lock = startLocks.computeIfAbsent(key, k -> new Object());
        try {
            synchronized (lock) {
                return startLocked(orderId, returnTo, locale, embedded);
            }
        } finally {
            startLocks.remove(key, lock);
        }
    }

    private StartedPayment startLocked(byte[] orderId, ReturnTo returnTo, String locale, boolean embedded) {
        String display = embedded ? "iframe" : "page";
        Instant now = Instant.now();
        String key = UuidUtil.toString(orderId);
        Order order = orders.findWithItemsById(orderId)
                .orElseThrow(() -> new BadRequestException(messages.current("api.order.notFound")));
        if (order.getStatus() == OrderStatus.REJECTED
                && "PAYMENT_TIMEOUT".equals(order.getRejectReasonCode())) {
            throw new ConflictException(messages.current("api.payment.expired"), "PAYMENT_EXPIRED");
        }
        long amount = OrderService.amountDueMinor(order);
        if (order.getStatus() == OrderStatus.REJECTED || order.getStatus() == OrderStatus.DELIVERED || amount <= 0) {
            throw new ConflictException(messages.current("api.payment.notPayable"), "NOT_PAYABLE");
        }
        if (order.getPaymentDueAt() != null && !order.getPaymentDueAt().isAfter(now)) {
            throw new ConflictException(messages.current("api.payment.expired"), "PAYMENT_EXPIRED");
        }

        List<PaymentInvoice> existing = invoices.findByOrderIdOrderByCreatedAtDesc(orderId);
        for (PaymentInvoice inv : existing) {
            if (PaymentInvoice.PROCESSING.equals(inv.getStatus()) || PaymentInvoice.HOLD.equals(inv.getStatus())) {
                throw new ConflictException(messages.current("api.payment.inProgress"), "PAYMENT_IN_PROGRESS");
            }
            if (inv.isPayable(now) && inv.getAmountMinor() == amount && display.equals(inv.getDisplayType())) {
                return new StartedPayment(inv.getExternalId(), inv.getPageUrl(), inv.getAmountMinor(), inv.getExpiresAt());
            }
        }
        // Outdated pages (other amount / about to expire) are closed so nobody pays twice.
        for (PaymentInvoice inv : existing) {
            if (PaymentInvoice.CREATED.equals(inv.getStatus())) {
                removeQuietly(inv);
            }
        }

        Instant expiresAt = now.plus(Duration.ofMinutes(Math.max(5, props.getPayment().getInvoiceTtlMinutes())));
        if (order.getPaymentDueAt() != null && order.getPaymentDueAt().isBefore(expiresAt)) {
            // monobank must not take money after we have cancelled the order.
            expiresAt = order.getPaymentDueAt();
        }
        long validity = Math.max(60, Duration.between(now, expiresAt).toSeconds());
        String shortId = key.substring(0, 8);
        List<MonobankClient.BasketItem> basket = basket(order, amount, shortId, taxCodes());
        MonobankClient.CreatedInvoice created;
        try {
            created = mono.createInvoice(new MonobankClient.CreateInvoice(
                    amount,
                    key,
                    "Оплата замовлення #" + shortId + " — ChiSetup",
                    basket,
                    redirectUrl(order, returnTo, locale, embedded),
                    webhookUrl(),
                    validity,
                    embedded));
        } catch (MonobankClient.MonobankException e) {
            log.warn("monobank invoice/create failed for order {}: {}", key, e.getMessage());
            throw new ConflictException(messages.current("api.payment.failed"), "PAYMENT_FAILED");
        }
        if (created.invoiceId() == null || created.pageUrl() == null) {
            throw new ConflictException(messages.current("api.payment.failed"), "PAYMENT_FAILED");
        }
        PaymentInvoice inv = new PaymentInvoice();
        inv.setOrderId(orderId);
        inv.setExternalId(created.invoiceId());
        inv.setAmountMinor(amount);
        inv.setPageUrl(created.pageUrl());
        inv.setDisplayType(display);
        inv.setBasketJson(toJson(basket));
        inv.setExpiresAt(now.plusSeconds(validity));
        inv.setStatus(PaymentInvoice.CREATED);
        invoices.save(inv);
        log.info("monobank invoice {} for order {}: {} kop", created.invoiceId(), key, amount);
        return new StartedPayment(inv.getExternalId(), inv.getPageUrl(), amount, inv.getExpiresAt());
    }

    /**
     * The basket shown on the payment page. Itemised when the lines add up to exactly the amount
     * (full payment, no discount); otherwise one line "оплата замовлення" — monobank (and a fiscal
     * receipt) needs the lines to sum to the invoice amount.
     */
    static List<MonobankClient.BasketItem> basket(Order order, long amount, String shortId) {
        return basket(order, amount, shortId, List.of());
    }

    static List<MonobankClient.BasketItem> basket(Order order, long amount, String shortId, List<Integer> tax) {
        List<MonobankClient.BasketItem> lines = new ArrayList<>();
        long sum = 0;
        for (OrderItem it : order.getItems()) {
            if (it.getPriceMinorSnapshot() <= 0 || it.getQuantity() <= 0) {
                continue; // gifts
            }
            String name = it.getTitleSnapshot()
                    + (it.getVariantNameSnapshot() == null || it.getVariantNameSnapshot().isBlank()
                    ? "" : " (" + it.getVariantNameSnapshot() + ")");
            lines.add(new MonobankClient.BasketItem(cut(name, 200), it.getQuantity(), it.getPriceMinorSnapshot(),
                    UuidUtil.toString(it.getProductId()), tax));
            sum += it.getPriceMinorSnapshot() * it.getQuantity();
        }
        if (sum == amount && !lines.isEmpty()) {
            return lines;
        }
        String title = amount < order.getTotalMinor() && order.getPrepaymentMinor() > 0
                ? "Передоплата за замовлення #" + shortId
                : "Оплата замовлення #" + shortId;
        return List.of(new MonobankClient.BasketItem(title, 1, amount, "order-" + shortId, tax));
    }

    private static String toJson(List<MonobankClient.BasketItem> basket) {
        try {
            return JSON.writeValueAsString(basket);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Items of a refund, for the return receipt: a full refund returns exactly the lines sold; a
     * partial one is a single line for the amount.
     */
    List<MonobankClient.BasketItem> refundItems(PaymentInvoice inv, long amount, boolean full) {
        if (full && inv.getBasketJson() != null) {
            try {
                List<MonobankClient.BasketItem> sold = JSON.readValue(inv.getBasketJson(),
                        new com.fasterxml.jackson.core.type.TypeReference<List<MonobankClient.BasketItem>>() { });
                if (!sold.isEmpty()) {
                    return sold;
                }
            } catch (Exception e) {
                log.warn("invoice {}: unreadable basket_json — refunding as one line", inv.getExternalId());
            }
        }
        String shortId = UuidUtil.toString(inv.getOrderId()).substring(0, 8);
        return List.of(new MonobankClient.BasketItem("Повернення за замовлення #" + shortId, 1, amount,
                "order-" + shortId, taxCodes()));
    }

    /**
     * Where monobank sends the browser after paying. Embedded (iframe): a tiny page that only tells
     * the parent window "done" (postMessage) — the parent polls our API for the real status.
     */
    private String redirectUrl(Order order, ReturnTo returnTo, String locale, boolean embedded) {
        String id = UuidUtil.toString(order.getId());
        String lang = locale == null || locale.isBlank() ? "uk" : locale;
        String prefix = "uk".equals(lang) ? "" : "/" + lang;
        String embed = embedded ? "&embedded=1" : "";
        if (returnTo == ReturnTo.MINIAPP) {
            // Opened from the Mini App in a browser: a small page that sends them back to Telegram.
            return trimSlash(props.getWebappBaseUrl()) + "/pay-return?order=" + id + "&lang=" + lang + embed;
        }
        if (embedded) {
            return trimSlash(props.getSite().getBaseUrl()) + prefix + "/pay-return?order=" + id + embed;
        }
        return trimSlash(props.getSite().getBaseUrl()) + prefix + "/account/orders/" + id + "?payment=return";
    }

    private String webhookUrl() {
        String configured = props.getPayment().getMonobank().getWebhookUrl();
        if (configured != null && !configured.isBlank()) {
            return configured;
        }
        return trimSlash(props.getSite().getBaseUrl()) + "/api/payments/mono/webhook";
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
        } catch (MonobankClient.MonobankException e) {
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
                .orElseThrow(() -> new BadRequestException("invoice not found"));
        if (inv.getAppliedAt() == null) {
            throw new BadRequestException("счёт не оплачен — возвращать нечего");
        }
        long left = inv.getAmountMinor() - inv.getRefundedMinor();
        if (amountMinor != null && (amountMinor <= 0 || amountMinor > left)) {
            throw new BadRequestException("сумма возврата должна быть от 0.01 до " + left / 100.0 + " грн");
        }
        if (left <= 0) {
            throw new BadRequestException("по этому счёту всё уже возвращено");
        }
        String extRef = "refund-" + UuidUtil.toString(UuidUtil.randomBytes()).substring(0, 13);
        try {
            boolean full = amountMinor == null || amountMinor == left;
            // A full refund of an untouched invoice returns the sold lines; anything else is one line.
            boolean asSold = full && inv.getRefundedMinor() == 0;
            mono.cancel(inv.getExternalId(), extRef, full ? null : amountMinor,
                    refundItems(inv, full ? left : amountMinor, asSold));
        } catch (MonobankClient.MonobankException e) {
            throw new BadRequestException("monobank отклонил возврат: " + e.getMessage());
        }
        tx.executeWithoutResult(s -> invoices.findForUpdate(PaymentInvoice.PROVIDER_MONOBANK, invoiceId)
                .ifPresent(i -> {
                    i.setRefundPendingUntil(Instant.now().plus(Duration.ofDays(2)));
                    invoices.save(i);
                }));
        refresh(inv);
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
        } catch (MonobankClient.MonobankException e) {
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

    // ------------------------------------------------------------------ helpers

    static Instant parseDate(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        try {
            return OffsetDateTime.parse(s).toInstant();
        } catch (DateTimeParseException e) {
            try {
                return Instant.parse(s);
            } catch (DateTimeParseException e2) {
                return null;
            }
        }
    }

    private static String trimSlash(String s) {
        if (s == null) {
            return "";
        }
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }

    private static String cut(String s, int max) {
        return s == null ? null : s.length() <= max ? s : s.substring(0, max);
    }
}
