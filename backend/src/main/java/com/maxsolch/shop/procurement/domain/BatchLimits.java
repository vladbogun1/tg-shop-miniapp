package com.maxsolch.shop.procurement.domain;

import com.maxsolch.shop.platform.error.DomainException;

import java.math.BigDecimal;

/**
 * Sanity bounds of the batch money the admin types: an expense, a purchase price per unit, a manual share, the rate.
 * Without them one typo ({@code 99 999 999 999 999}) overflows a sum or turns the cost of goods into −255 trillion.
 * Amounts are in minor units of their own currency; {@value #MAX_MINOR} = 100 000 000,00.
 */
public final class BatchLimits {

    public static final long MAX_MINOR = 10_000_000_000L;
    public static final BigDecimal MAX_RATE = BigDecimal.valueOf(10_000);
    public static final int CANCEL_REASON_MAX = 500;
    private static final String MAX_MINOR_TEXT = "100 000 000";

    private BatchLimits() {
    }

    /** An expense: non-zero, |amount| ≤ {@link #MAX_MINOR} (a negative one is a compensation). */
    public static long expense(Long amountMinor) {
        if (amountMinor == null || amountMinor == 0) {
            throw new DomainException.BadRequest(ProcurementError.BAD_AMOUNT);
        }
        if (Math.abs(amountMinor) > MAX_MINOR) {
            throw new DomainException.BadRequest(ProcurementError.AMOUNT_TOO_BIG, MAX_MINOR_TEXT);
        }
        return amountMinor;
    }

    /** A purchase price per unit: null (not known yet) or 0 … {@link #MAX_MINOR}. */
    public static Long unitPrice(Long priceFx) {
        if (priceFx != null && priceFx < 0) {
            throw new DomainException.BadRequest(ProcurementError.BAD_PRICE);
        }
        if (priceFx != null && priceFx > MAX_MINOR) {
            throw new DomainException.BadRequest(ProcurementError.PRICE_TOO_BIG, MAX_MINOR_TEXT);
        }
        return priceFx;
    }

    /** A line's typed share of the expenses (MANUAL), UAH kopecks: null or 0 … {@link #MAX_MINOR}. */
    public static Long manualExtra(Long minor) {
        if (minor != null && (minor < 0 || minor > MAX_MINOR)) {
            throw new DomainException.BadRequest(ProcurementError.BAD_MANUAL_EXTRA, MAX_MINOR_TEXT);
        }
        return minor;
    }

    /** Why a batch was cancelled: null/blank gives null, otherwise trimmed, at most {@link #CANCEL_REASON_MAX} chars. */
    public static String cancelReason(String reason) {
        if (reason == null || reason.isBlank()) {
            return null;
        }
        String r = reason.trim();
        if (r.length() > CANCEL_REASON_MAX) {
            throw new DomainException.BadRequest(ProcurementError.CANCEL_REASON_TOO_LONG, String.valueOf(CANCEL_REASON_MAX));
        }
        return r;
    }

    /** UAH per unit of the currency: above 0 and not above {@link #MAX_RATE}. */
    public static BigDecimal rate(BigDecimal rate) {
        if (rate.signum() <= 0 || rate.compareTo(MAX_RATE) > 0) {
            throw new DomainException.BadRequest(ProcurementError.BAD_RATE, MAX_RATE.toPlainString());
        }
        return rate;
    }
}
