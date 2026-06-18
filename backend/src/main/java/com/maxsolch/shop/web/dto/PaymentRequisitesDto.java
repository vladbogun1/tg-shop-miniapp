package com.maxsolch.shop.web.dto;

public record PaymentRequisitesDto(
        String cardNumber,
        String iban,
        String recipient,
        String edrpou,
        String purpose,
        String note) {
}
