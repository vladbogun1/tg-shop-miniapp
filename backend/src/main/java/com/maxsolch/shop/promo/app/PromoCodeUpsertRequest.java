package com.maxsolch.shop.promo.app;

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
        Boolean active,
        /** Ceiling of the discount in kopecks (V63): 0 = none, null = leave as is. */
        @Min(value = 0, message = "не может быть отрицательным") Long maxDiscountMinor,
        /**
         * Last day the code works, {@code yyyy-MM-dd} in the shop's timezone (valid through 23:59:59 of that day).
         * null = leave the expiry as it is (a quick on/off switch must not touch it); a past day is refused.
         */
        @Pattern(regexp = "^\\d{4}-\\d{2}-\\d{2}$", message = "дата в формате ГГГГ-ММ-ДД") String expiresOn,
        /** true = remove the expiry (the code never expires); wins over {@code expiresOn}. */
        Boolean noExpiry) {

    public PromoCodeUpsertRequest(String code, int discountPercent, long discountAmountMinor, Integer maxUses,
                                  Boolean active) {
        this(code, discountPercent, discountAmountMinor, maxUses, active, null, null, null);
    }

    public PromoCodeUpsertRequest(String code, int discountPercent, long discountAmountMinor, Integer maxUses,
                                  Boolean active, Long maxDiscountMinor) {
        this(code, discountPercent, discountAmountMinor, maxUses, active, maxDiscountMinor, null, null);
    }
}
