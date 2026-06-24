package com.maxsolch.shop.web.dto;

/** Result of placing an order. Includes the shop requisites so the success screen
 *  can show them immediately without a second fetch. */
public record CreateOrderResponse(String orderId, PaymentRequisitesDto requisites) {
}
