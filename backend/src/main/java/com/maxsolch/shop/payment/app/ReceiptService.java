package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.payment.domain.PaymentInvoice;
import com.maxsolch.shop.payment.domain.ReceiptKind;
import com.maxsolch.shop.payment.domain.MonobankGateway;
import com.maxsolch.shop.payment.infra.PaymentInvoiceRepository;
import com.maxsolch.shop.platform.cache.CacheConfig;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import com.maxsolch.shop.platform.util.UuidUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import static com.maxsolch.shop.platform.util.Texts.blankToNull;

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

    /** The cached answer for one invoice; {@code ok=false} — the call failed. */
    record Checks(List<MonobankGateway.FiscalCheck> checks, boolean ok) {

        boolean isFinal() {
            return ok && !checks.isEmpty() && checks.stream().allMatch(c -> c.isDone() || c.isFailed());
        }
    }

    /** A PDF ready to stream. */
    public record Pdf(byte[] bytes, String fileName) {
    }

    private final MonobankGateway mono;
    private final PaymentInvoiceRepository invoices;
    private final ReceiptSigner signer;

    /** Three caches, one per lifetime (see {@link CacheConfig}): a check may still change, all final, failed. */
    private final Cache open;
    private final Cache finalChecks;
    private final Cache failed;

    public ReceiptService(MonobankGateway mono, PaymentInvoiceRepository invoices, ReceiptSigner signer,
                          CacheManager caches) {
        this.mono = mono;
        this.invoices = invoices;
        this.signer = signer;
        this.open = java.util.Objects.requireNonNull(caches.getCache(CacheConfig.RECEIPT_CHECKS_OPEN));
        this.finalChecks = java.util.Objects.requireNonNull(caches.getCache(CacheConfig.RECEIPT_CHECKS_FINAL));
        this.failed = java.util.Objects.requireNonNull(caches.getCache(CacheConfig.RECEIPT_CHECKS_ERROR));
    }

    private Checks cached(String key) {
        for (Cache c : new Cache[] {finalChecks, open, failed}) {
            Checks hit = c.get(key, Checks.class);
            if (hit != null) {
                return hit;
            }
        }
        return null;
    }

    private void cachePut(String key, Checks value) {
        Cache target = !value.ok() ? failed : value.isFinal() ? finalChecks : open;
        for (Cache c : new Cache[] {finalChecks, open, failed}) {
            if (c != target) {
                c.evict(key);
            }
        }
        target.put(key, value);
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
                for (MonobankGateway.FiscalCheck c : checks(inv)) {
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

    ReceiptDto toDto(String rowId, PaymentInvoice inv, MonobankGateway.FiscalCheck c) {
        ReceiptKind kind = ReceiptKind.ofCheck(c);
        String status = statusOf(c);
        String download = READY.equals(status) && c.id() != null ? signer.signedUrl(rowId, kind, c.id()) : null;
        return new ReceiptDto("fiscal:" + c.id(), kind.name(), status, blankToNull(c.statusDescription()),
                blankToNull(c.taxUrl()), null, kind == ReceiptKind.FISCAL_SALE ? inv.getAmountMinor() : null, download);
    }

    /** new / process → PENDING, done → READY, failed (or anything unknown) → FAILED. */
    static String statusOf(MonobankGateway.FiscalCheck c) {
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
    List<MonobankGateway.FiscalCheck> checks(PaymentInvoice inv) {
        String externalId = inv.getExternalId();
        String key = cacheKey(inv);
        Checks cached = cached(key);
        if (cached == null) {
            try {
                cached = new Checks(stripFiles(mono.fiscalChecks(externalId)), true);
            } catch (Exception e) {
                log.warn("fiscal checks of invoice {} failed: {}", externalId, e.getMessage());
                cached = new Checks(List.of(), false);
            }
            cachePut(key, cached);
        }
        return cached.checks();
    }

    /** A fresh answer from the background job — keeps the page in step without another call. */
    void remember(PaymentInvoice inv, List<MonobankGateway.FiscalCheck> fresh) {
        cachePut(cacheKey(inv), new Checks(stripFiles(fresh), true));
    }

    private static List<MonobankGateway.FiscalCheck> stripFiles(List<MonobankGateway.FiscalCheck> list) {
        if (list == null) {
            return List.of();
        }
        return list.stream()
                .map(c -> new MonobankGateway.FiscalCheck(c.id(), c.type(), c.status(), c.statusDescription(),
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
                List<MonobankGateway.FiscalCheck> fresh = mono.fiscalChecks(inv.getExternalId());
                remember(inv, fresh);
                bytes = fresh.stream()
                        .filter(c -> checkId != null && checkId.equals(c.id()) && c.isDone())
                        .findFirst()
                        .map(c -> MonobankGateway.decodePdf(c.file()))
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
