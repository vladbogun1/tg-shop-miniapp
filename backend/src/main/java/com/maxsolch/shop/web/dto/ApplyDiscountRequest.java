package com.maxsolch.shop.web.dto;

/**
 * Admin applies a discount to an existing order. Exactly one mode:
 *  - promoCode: apply an existing promo code (validated),
 *  - amountMinor: manual fixed discount,
 *  - percent: manual percent of the subtotal,
 *  - clear=true: remove any discount.
 */
public record ApplyDiscountRequest(
        String promoCode,
        Long amountMinor,
        Integer percent,
        Boolean clear,
        /** DM the customer about the discount (default true). */
        Boolean notifyCustomer) {
}
