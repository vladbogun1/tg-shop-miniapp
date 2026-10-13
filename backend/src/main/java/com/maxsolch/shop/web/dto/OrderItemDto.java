package com.maxsolch.shop.web.dto;

public record OrderItemDto(
        Long id,
        String productId,
        String title,
        long priceMinor,
        String variantId,
        String variantName,
        int quantity,
        String imageUrl,
        boolean gift,
        /** Units of this line the customer sent back. */
        int returnedQty,
        /** Got the «Вместе дешевле» discount (V57). */
        boolean bundleAddon,
        /** Gift the shop added for the order sum (V57). */
        boolean autoGift) {
}
