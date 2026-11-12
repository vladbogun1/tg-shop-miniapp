package com.maxsolch.shop.delivery.domain;

import java.time.Instant;

/**
 * «This set of goods went into this box N times» (V99 {@code np_packing_memory}).
 *
 * @param goodsSig the goods fingerprint ({@link ShipmentStaleness#goodsKey})
 * @param boxKey   {@link #boxKey(String, int)} for a box of the catalog, {@link #customKey} for typed-in sides
 * @param boxId    the catalog box, null for typed-in sides
 */
public record PackingMemoryEntry(String goodsSig, String boxKey, byte[] boxId, Integer lengthMm, Integer widthMm,
                                 Integer heightMm, int uses, Instant lastUsedAt) {

    /** «&lt;box id&gt;@130». */
    public static String boxKey(String boxId, int heightMm) {
        return boxId + "@" + heightMm;
    }

    /** «custom:400x240x95». */
    public static String customKey(int lengthMm, int widthMm, int heightMm) {
        return "custom:" + lengthMm + "x" + widthMm + "x" + heightMm;
    }
}
