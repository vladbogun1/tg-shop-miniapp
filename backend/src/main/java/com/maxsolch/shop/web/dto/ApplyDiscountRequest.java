package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * Admin applies a discount to an existing order. Exactly one mode:
 *  - promoCode: apply an existing promo code (validated),
 *  - amountMinor: manual fixed discount,
 *  - percent: manual percent of the subtotal,
 *  - clear=true: remove any discount.
 */
public record ApplyDiscountRequest(
        @Size(max = 64) String promoCode,
        @Positive(message = "сумма скидки должна быть больше 0") Long amountMinor,
        @Positive(message = "процент должен быть больше 0")
        @Max(value = 100, message = "не больше 100 %") Integer percent,
        Boolean clear,
        /** DM the customer about the discount (default true). */
        Boolean notifyCustomer) {
}
