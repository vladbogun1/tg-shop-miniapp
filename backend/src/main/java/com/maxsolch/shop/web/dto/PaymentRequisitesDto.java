package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.Size;

/** Lengths follow the {@code payment_requisites} columns, so an overlong field is a readable 400. */
public record PaymentRequisitesDto(
        @Size(max = 64, message = "не длиннее 64 символов") String cardNumber,
        @Size(max = 64, message = "не длиннее 64 символов") String iban,
        @Size(max = 255, message = "не длиннее 255 символов") String recipient,
        @Size(max = 32, message = "не длиннее 32 символов") String edrpou,
        @Size(max = 255, message = "не длиннее 255 символов") String purpose,
        @Size(max = 2048, message = "не длиннее 2048 символов") String note) {
}
