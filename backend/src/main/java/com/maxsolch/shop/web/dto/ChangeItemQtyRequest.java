package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/** Admin changes an order item's quantity. */
public record ChangeItemQtyRequest(
        @Min(value = 1, message = "не меньше 1 (чтобы убрать позицию, удалите её)")
        @Max(value = 10_000, message = "слишком большое количество") Integer quantity,
        /** DM the customer about the change (default true). */
        Boolean notifyCustomer) {
}
