package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.payment.domain.PaymentError;
import com.maxsolch.shop.platform.error.DomainException;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** The deliveries a payment option is offered for, as the admin editor sends them (CSV). */
final class PaymentDeliveries {

    private static final Set<String> KEYS = Set.of("WAREHOUSE", "POSTOMAT", "DOORS", "PICKUP");

    private PaymentDeliveries() {
    }

    /** Upper-cased known keys, CSV; blank or all four = null (offered everywhere). */
    static String normalize(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        List<String> keys = new ArrayList<>();
        for (String part : raw.split(",")) {
            String k = part.trim().toUpperCase(Locale.ROOT);
            if (k.isEmpty()) {
                continue;
            }
            if (!KEYS.contains(k)) {
                throw new DomainException.BadRequest(PaymentError.DELIVERY_UNKNOWN, part.trim());
            }
            if (!keys.contains(k)) {
                keys.add(k);
            }
        }
        if (keys.isEmpty()) {
            throw new DomainException.BadRequest(PaymentError.DELIVERY_REQUIRED);
        }
        return keys.size() == KEYS.size() ? null : String.join(",", keys);
    }
}
