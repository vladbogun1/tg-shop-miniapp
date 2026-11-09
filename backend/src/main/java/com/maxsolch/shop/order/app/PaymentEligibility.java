package com.maxsolch.shop.order.app;

import com.maxsolch.shop.customer.app.CustomerFlags;
import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Component;

/**
 * Which payment options this buyer may choose. A buyer marked «проблемный покупатель» pays the whole order online:
 * a prepayment with the rest cash on delivery is how the shop got burnt, so it is refused here (the apps hide that
 * option already; this is the server's word on it).
 */
@Component
public class PaymentEligibility {

    private final CustomerFlags flags;
    private final OrderPaymentOptions options;

    public PaymentEligibility(CustomerFlags flags, OrderPaymentOptions options) {
        this.flags = flags;
        this.options = options;
    }

    /**
     * 400 {@code ONLINE_PAYMENT_ONLY} when a marked buyer chose a prepayment option. A missing, malformed or
     * unknown option is left to {@link Checkout} and its own errors.
     */
    public void requireAllowed(long userId, String paymentOptionId) {
        if (paymentOptionId == null || paymentOptionId.isBlank() || !flags.onlinePaymentOnly(userId)) {
            return;
        }
        byte[] id;
        try {
            id = UuidUtil.toBytes(paymentOptionId.trim());
        } catch (IllegalArgumentException e) {
            return;
        }
        options.findActive(id)
                .filter(OrderPaymentOptions.Option::requiresPrepayment)
                .ifPresent(o -> {
                    throw new DomainException.BadRequest(OrderError.ONLINE_PAYMENT_ONLY);
                });
    }
}
