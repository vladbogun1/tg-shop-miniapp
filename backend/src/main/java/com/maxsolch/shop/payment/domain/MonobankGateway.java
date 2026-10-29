package com.maxsolch.shop.payment.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * The payment module's view of monobank acquiring (https://monobank.ua/api-docs/acquiring): the few calls the shop
 * needs. {@code app} talks to this port; {@code infra.MonobankClient} is the HTTP implementation. Every call may
 * throw {@link MonobankException}; none of them is ever made inside a database transaction.
 */
public interface MonobankGateway {

    /** False while no token is configured: calls then fail with {@link MonobankException} code DISABLED. */
    boolean isEnabled();

    /** {@code POST /api/merchant/invoice/create}. */
    CreatedInvoice createInvoice(CreateInvoice req);

    /** {@code GET /api/merchant/invoice/status}. */
    MonobankInvoiceStatus status(String invoiceId);

    /** {@code POST /api/merchant/invoice/cancel} — full refund when {@code amount} is null. */
    default String cancel(String invoiceId, String extRef, Long amount) {
        return cancel(invoiceId, extRef, amount, List.of());
    }

    /**
     * Refund with the returned items ({@code items} — mandatory when fiscalisation is on, so a return receipt
     * can be issued).
     */
    String cancel(String invoiceId, String extRef, Long amount, List<BasketItem> items);

    /** {@code POST /api/merchant/invoice/remove} — closes an unpaid payment page. */
    void remove(String invoiceId);

    /** {@code GET /api/merchant/invoice/fiscal-checks} — empty when fiscalisation is off. */
    List<FiscalCheck> fiscalChecks(String invoiceId);

    /**
     * {@code GET /api/merchant/invoice/receipt} — the bank's payment receipt (квитанція) as a PDF. Not a fiscal
     * document; works without a PRRO. Null when monobank returned no file.
     */
    byte[] bankReceipt(String invoiceId);

    /** {@code GET /api/merchant/pubkey} — base64 of the PEM public key for webhook signatures. */
    String pubkey();

    /** {@code GET /api/merchant/details} — also a cheap "is the token valid" probe. */
    MerchantDetails details();

    /**
     * One line of the basket shown on the payment page and used for fiscal receipts.
     * {@code tax} — tax rate codes of the merchant's PRRO (mandatory for Вчасно.Каса); may be empty.
     */
    record BasketItem(String name, long qty, long sum, String code, List<Integer> tax) {

        public BasketItem(String name, long qty, long sum, String code) {
            this(name, qty, sum, code, List.of());
        }
    }

    record CreateInvoice(long amount, String reference, String destination, List<BasketItem> basket,
                         String redirectUrl, String webHookUrl, long validitySeconds, boolean iframe) {
    }

    record CreatedInvoice(String invoiceId, String pageUrl) {
    }

    record MerchantDetails(String merchantId, String merchantName, String edrpou) {
    }

    /**
     * One fiscal receipt of an invoice (PRRO — Вчасно.Каса / Checkbox / monopay).
     *
     * @param type   sale | return
     * @param status new | process | done | failed
     * @param file   base64 PDF; usually only once {@code done}
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record FiscalCheck(String id, String type, String status, String statusDescription, String taxUrl,
                       String file, String fiscalizationSource) {

        public boolean isDone() {
            return "done".equalsIgnoreCase(status);
        }

        public boolean isFailed() {
            return "failed".equalsIgnoreCase(status);
        }

        public boolean isReturn() {
            return "return".equalsIgnoreCase(type);
        }
    }

    /** base64 → bytes; null for a missing or broken value. */
    static byte[] decodePdf(String base64) {
        if (base64 == null || base64.isBlank()) {
            return null;
        }
        try {
            return java.util.Base64.getMimeDecoder().decode(base64);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** A monobank call failed: HTTP status (0 = no response), errCode, errText. */
    class MonobankException extends RuntimeException {
        private final String errCode;

        public MonobankException(int httpStatus, String errCode, String errText) {
            super("monobank " + (httpStatus == 0 ? "" : httpStatus + " ") + (errCode == null ? "" : errCode + ": ") + errText);
            this.errCode = errCode;
        }

        public String getErrCode() {
            return errCode;
        }
    }
}
