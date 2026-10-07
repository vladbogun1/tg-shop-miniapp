package com.maxsolch.shop.payment;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Expiry;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.web.dto.ReceiptDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import static com.maxsolch.shop.common.Texts.blankToNull;

/**
 * Payment receipts of an order: the fiscal checks monobank's PRRO (Вчасно.Каса) issued for each
 * paid invoice — a sale, and a return per refund — plus the bank's own квитанція per paid invoice.
 *
 * <p>Read-only and best-effort: monobank is asked outside any DB transaction, a failure is logged
 * and yields an empty list (never a 500 on the order page). Fiscal-check lists are cached briefly
 * so page loads and the 20-second refetch while a check is being issued do not hammer monobank;
 * once every check of an invoice is final the list is kept much longer. The cached copy never
 * holds the PDFs — a download asks monobank again.
 */
@Slf4j
@Service
public class ReceiptService {

    public static final String PENDING = "PENDING";
    public static final String READY = "READY";
    public static final String FAILED = "FAILED";

    /** A check may still change (or none was issued yet). */
    private static final Duration TTL_OPEN = Duration.ofSeconds(45);
    /** Every check is done / failed: nothing changes until a refund adds a return check. */
    private static final Duration TTL_FINAL = Duration.ofMinutes(10);
    /** monobank failed: do not retry on every page load. */
    private static final Duration TTL_ERROR = Duration.ofSeconds(60);

    /** The cached answer for one invoice; {@code ok=false} — the call failed. */
    record Checks(List<MonobankClient.FiscalCheck> checks, boolean ok) {

        boolean isFinal() {
            return ok && !checks.isEmpty() && checks.stream().allMatch(c -> c.isDone() || c.isFailed());
        }
    }

    /** A PDF ready to stream. */
    public record Pdf(byte[] bytes, String fileName) {
    }

    private final MonobankClient mono;
    private final PaymentInvoiceRepository invoices;
    private final ReceiptSigner signer;

    private final Cache<String, Checks> cache = Caffeine.newBuilder()
            .maximumSize(5_000)
            .expireAfter(new Expiry<String, Checks>() {
                @Override
                public long expireAfterCreate(String key, Checks value, long currentTime) {
                    Duration d = !value.ok() ? TTL_ERROR : value.isFinal() ? TTL_FINAL : TTL_OPEN;
                    return d.toNanos();
                }

                @Override
                public long expireAfterUpdate(String key, Checks value, long currentTime, long currentDuration) {
                    return expireAfterCreate(key, value, currentTime);
                }

                @Override
                public long expireAfterRead(String key, Checks value, long currentTime, long currentDuration) {
                    return currentDuration;
                }
            })
            .build();

    public ReceiptService(MonobankClient mono, PaymentInvoiceRepository invoices, ReceiptSigner signer) {
        this.mono = mono;
        this.invoices = invoices;
        this.signer = signer;
    }

    /** Receipts of every paid invoice of the order, oldest payment first. Never throws. */
    public List<ReceiptDto> forOrder(byte[] orderId) {
        if (!mono.isEnabled()) {
            return List.of();
        }
        try {
            List<PaymentInvoice> paid = invoices.findByOrderIdOrderByCreatedAtDesc(orderId).stream()
                    .filter(i -> i.getAppliedAt() != null)
                    .sorted(Comparator.comparing(PaymentInvoice::getAppliedAt))
                    .toList();
            List<ReceiptDto> out = new ArrayList<>();
            for (PaymentInvoice inv : paid) {
                String rowId = UuidUtil.toString(inv.getId());
                for (MonobankClient.FiscalCheck c : checks(inv)) {
                    out.add(toDto(rowId, inv, c));
                }
                out.add(new ReceiptDto("bank:" + rowId, ReceiptKind.BANK.name(), READY, null, null,
                        inv.getAppliedAt(), inv.getAmountMinor(), signer.signedUrl(rowId, ReceiptKind.BANK, null)));
            }
            return out;
        } catch (Exception e) {
            log.warn("receipts of order {} failed: {}", UuidUtil.toString(orderId), e.getMessage());
            return List.of();
        }
    }

    ReceiptDto toDto(String rowId, PaymentInvoice inv, MonobankClient.FiscalCheck c) {
        ReceiptKind kind = ReceiptKind.ofCheck(c);
        String status = statusOf(c);
        String download = READY.equals(status) && c.id() != null ? signer.signedUrl(rowId, kind, c.id()) : null;
        return new ReceiptDto("fiscal:" + c.id(), kind.name(), status, blankToNull(c.statusDescription()),
                blankToNull(c.taxUrl()), null, kind == ReceiptKind.FISCAL_SALE ? inv.getAmountMinor() : null, download);
    }

    /** new / process → PENDING, done → READY, failed (or anything unknown) → FAILED. */
    static String statusOf(MonobankClient.FiscalCheck c) {
        String s = c.status() == null ? "" : c.status().toLowerCase(java.util.Locale.ROOT);
        return switch (s) {
            case "new", "process" -> PENDING;
            case "done" -> READY;
            default -> FAILED;
        };
    }

    /**
     * Cache key: the invoice plus what was refunded from it — a refund brings a return check, so a
     * list that was "final" before it must not hide that check for the next ten minutes.
     */
    private static String cacheKey(PaymentInvoice inv) {
        return inv.getExternalId() + ":" + inv.getRefundedMinor();
    }

    /** Cached fiscal checks of a paid invoice (without PDFs); empty on any failure. */
    List<MonobankClient.FiscalCheck> checks(PaymentInvoice inv) {
        String externalId = inv.getExternalId();
        String key = cacheKey(inv);
        Checks cached = cache.getIfPresent(key);
        if (cached == null) {
            try {
                cached = new Checks(stripFiles(mono.fiscalChecks(externalId)), true);
            } catch (Exception e) {
                log.warn("fiscal checks of invoice {} failed: {}", externalId, e.getMessage());
                cached = new Checks(List.of(), false);
            }
            cache.put(key, cached);
        }
        return cached.checks();
    }

    /** A fresh answer from the background job — keeps the page in step without another call. */
    void remember(PaymentInvoice inv, List<MonobankClient.FiscalCheck> fresh) {
        cache.put(cacheKey(inv), new Checks(stripFiles(fresh), true));
    }

    private static List<MonobankClient.FiscalCheck> stripFiles(List<MonobankClient.FiscalCheck> list) {
        if (list == null) {
            return List.of();
        }
        return list.stream()
                .map(c -> new MonobankClient.FiscalCheck(c.id(), c.type(), c.status(), c.statusDescription(),
                        c.taxUrl(), null, c.fiscalizationSource()))
                .toList();
    }

    /**
     * The PDF behind a (signature-verified) download link. Empty when the invoice is unknown, was
     * never paid, the check is not there / not done, or monobank failed.
     */
    public Optional<Pdf> file(String invoiceRowId, String kindName, String checkId) {
        ReceiptKind kind;
        byte[] rowId;
        try {
            kind = ReceiptKind.valueOf(kindName);
            rowId = UuidUtil.toBytes(invoiceRowId);
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
        Optional<PaymentInvoice> found = invoices.findById(rowId);
        if (found.isEmpty() || found.get().getAppliedAt() == null || !mono.isEnabled()) {
            return Optional.empty();
        }
        PaymentInvoice inv = found.get();
        String fileName = kind.fileName(orderShort(inv.getOrderId()));
        try {
            byte[] bytes;
            if (kind == ReceiptKind.BANK) {
                bytes = mono.bankReceipt(inv.getExternalId());
            } else {
                List<MonobankClient.FiscalCheck> fresh = mono.fiscalChecks(inv.getExternalId());
                remember(inv, fresh);
                bytes = fresh.stream()
                        .filter(c -> checkId != null && checkId.equals(c.id()) && c.isDone())
                        .findFirst()
                        .map(c -> MonobankClient.decodePdf(c.file()))
                        .orElse(null);
            }
            return bytes == null || bytes.length == 0 ? Optional.empty() : Optional.of(new Pdf(bytes, fileName));
        } catch (Exception e) {
            log.warn("receipt {} of invoice {} failed: {}", kind, inv.getExternalId(), e.getMessage());
            return Optional.empty();
        }
    }

    /** First 8 characters of the order UUID — what the customer sees as «#1a2b3c4d». */
    public static String orderShort(byte[] orderId) {
        String id = UuidUtil.toString(orderId);
        return id == null ? "order" : id.substring(0, 8);
    }
}
