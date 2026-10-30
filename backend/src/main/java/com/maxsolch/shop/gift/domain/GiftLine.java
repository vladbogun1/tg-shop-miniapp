package com.maxsolch.shop.gift.domain;

import com.maxsolch.shop.platform.time.ShopZone;

import java.time.Instant;
import java.time.YearMonth;

/** One gift line as the registry sees it. */
public record GiftLine(String orderId, Instant createdAt, Instant deliveredAt, String status, String customerName,
                       String phone, String tgUsername, GiftPerson person, String title, String variant, int quantity,
                       long unitMinor, String source, String tier) {

    public static final String SOURCE_CASE = "CASE";
    public static final String SOURCE_THRESHOLD = "THRESHOLD";
    public static final String SOURCE_ADMIN = "ADMIN";

    public long valueMinor() {
        return unitMinor * quantity;
    }

    /** When the gift was handed over: delivered, or (not yet) the order date. */
    public Instant date() {
        return deliveredAt != null ? deliveredAt : createdAt;
    }

    public YearMonth month() {
        return YearMonth.from(date().atZone(ShopZone.DEFAULT));
    }
}
