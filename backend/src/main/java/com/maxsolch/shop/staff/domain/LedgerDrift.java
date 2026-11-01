package com.maxsolch.shop.staff.domain;

/** An order whose money columns and money journal disagree: {@code orderNet} = received − refunded. */
public record LedgerDrift(String orderRef, String status, long orderNetMinor, long journalNetMinor) {
}
