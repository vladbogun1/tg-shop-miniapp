package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * Promo code form. Nothing was validated before: a 150 % or negative discount, a {@code maxUses}
 * of 0 or a code with spaces all saved fine and only misbehaved at checkout. That at least one of
 * percent/amount is set is checked in {@code PromoAdminService}.
 */
public record PromoCodeUpsertRequest(
        @NotBlank(message = "укажите код")
        @Size(max = 64, message = "не длиннее 64 символов")
        @Pattern(regexp = "^\\s*[\\p{L}\\p{N}_-]+\\s*$", message = "только буквы, цифры, «-» и «_», без пробелов")
        String code,
        @Min(value = 0, message = "не меньше 0") @Max(value = 100, message = "не больше 100") int discountPercent,
        @Min(value = 0, message = "не может быть отрицательной") long discountAmountMinor,
        /** null = unlimited. */
        @Positive(message = "лимит должен быть больше 0 (пусто — без лимита)") Integer maxUses,
        Boolean active) {
}
