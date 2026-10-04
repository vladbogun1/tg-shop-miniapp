package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/** Lengths follow the {@code payment_options} columns, so an overlong field is a readable 400. */
public record AdminPaymentOptionDto(
        String id,
        @NotBlank(message = "укажите название") @Size(max = 255, message = "не длиннее 255 символов") String title,
        @Size(max = 1024, message = "не длиннее 1024 символов") String description,
        boolean requiresPrepayment,
        @PositiveOrZero(message = "не может быть отрицательной") long prepaymentMinor,
        int sortOrder,
        /** Nullable: when the admin UI omits it, the option is treated as active. */
        Boolean active) {
}
