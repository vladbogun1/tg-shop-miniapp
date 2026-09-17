package com.maxsolch.shop.web.dto;

/** Admin changes an order item's quantity. */
public record ChangeItemQtyRequest(
        Integer quantity,
        /** DM the customer about the change (default true). */
        Boolean notifyCustomer) {
}
