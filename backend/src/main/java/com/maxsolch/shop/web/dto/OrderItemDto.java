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
        /** Gift the shop added for the order sum (V57). */
        boolean autoGift,
        /** Rarity of the gift-case prize (V57); null = not from a case. */
        String caseRarity,
        /** A case prize whose size the customer has not chosen yet (V59). */
        boolean variantPending,
        /** What one unit actually cost: price with the order discount spread in proportion (V68). */
        long unitPaidMinor,
        /** Units on their way back to the shop (V68): «Посылка вернулась» takes these. */
        int returnPendingQty) {
}
