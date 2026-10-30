package com.maxsolch.shop.platform.util;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * The rounding policy of money (minor units, {@code long}), in one place. Two rules, each for one kind of sum:
 * <ul>
 *   <li>{@link #percentOf}: a percent <b>of a customer's amount</b> (promo code, manual discount) is cut to the
 *       kopeck, never rounded up: the discount is not more than the exact percent;</li>
 *   <li>{@link #quotient} and {@link #convert}: a <b>cost</b> (a share per unit, a currency conversion) is rounded
 *       half up, as accounting does.</li>
 * </ul>
 * Both are for non-negative amounts; the callers cap and clamp before. Display-only statistics (ratios, averages
 * of reports) are not money and keep their own rounding.
 */
public final class Money {

    private Money() {
    }

    /** {@code percent} % of {@code amount}, cut down to a whole kopeck. */
    public static long percentOf(long amount, int percent) {
        return amount * percent / 100;
    }

    /** {@code numerator / denominator} rounded half up; {@code denominator} must be positive. */
    public static long quotient(long numerator, long denominator) {
        return BigDecimal.valueOf(numerator).divide(BigDecimal.valueOf(denominator), 0, RoundingMode.HALF_UP)
                .longValueExact();
    }

    /** {@code minor} of a currency times {@code rate}, in kopecks of UAH, rounded half up. */
    public static long convert(long minor, BigDecimal rate) {
        return BigDecimal.valueOf(minor).multiply(rate).setScale(0, RoundingMode.HALF_UP).longValueExact();
    }
}
