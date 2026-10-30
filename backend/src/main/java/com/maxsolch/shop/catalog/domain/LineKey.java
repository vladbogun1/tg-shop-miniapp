package com.maxsolch.shop.catalog.domain;

import com.maxsolch.shop.platform.util.UuidUtil;

/** Stable key of a sellable line: {@code productId:variantId} (the variant part is empty for a plain product). */
public final class LineKey {

    private LineKey() {
    }

    public static String of(byte[] productId, byte[] variantId) {
        return UuidUtil.toString(productId) + ":" + (variantId == null ? "" : UuidUtil.toString(variantId));
    }
}
