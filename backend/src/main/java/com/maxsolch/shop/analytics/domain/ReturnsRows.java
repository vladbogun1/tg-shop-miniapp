package com.maxsolch.shop.analytics.domain;

/** Rows of the «Возвраты» report as the queries read them. */
public final class ReturnsRows {

    private ReturnsRows() {
    }

    /** Money given back through one channel (cash, card, ...). */
    public record ChannelRow(String channel, long amountMinor, long count) {
    }

    /** Units written off for one reason and their value. */
    public record ReasonRow(String reason, long units, long valueMinor) {
    }
}
