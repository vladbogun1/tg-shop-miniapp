package com.maxsolch.shop.payment;

/** What a payment receipt is: a fiscal check (PRRO) of a sale or a refund, or the bank's квитанція. */
public enum ReceiptKind {
    FISCAL_SALE("check"),
    FISCAL_RETURN("return"),
    BANK("receipt");

    /** Suffix of the PDF file name: {@code chisetup-<orderShort>-<suffix>.pdf}. */
    private final String fileSuffix;

    ReceiptKind(String fileSuffix) {
        this.fileSuffix = fileSuffix;
    }

    public String fileSuffix() {
        return fileSuffix;
    }

    public static ReceiptKind ofCheck(MonobankClient.FiscalCheck c) {
        return c.isReturn() ? FISCAL_RETURN : FISCAL_SALE;
    }

    /** {@code chisetup-1a2b3c4d-check.pdf} */
    public String fileName(String orderShort) {
        return "chisetup-" + orderShort + "-" + fileSuffix + ".pdf";
    }
}
