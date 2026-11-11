package com.maxsolch.shop.order.app;

import java.util.Optional;

/**
 * The payment options on offer at checkout, as the order needs them for its snapshot. Declared by the order module,
 * implemented by {@code payment} (which owns the options).
 */
public interface OrderPaymentOptions {

    /** {@link Option#kind()} of «оплата при отриманні»: Nova Poshta collects the whole sum. */
    String KIND_ON_DELIVERY = "ON_DELIVERY";

    /** An option that is still on offer; empty for an unknown or switched-off one. */
    Optional<Option> findActive(byte[] id);

    /** The first active option paid online, in checkout order (never «при отриманні»). */
    Optional<Option> firstActive();

    /**
     * @param kind            null = paid online (in full or a prepayment); {@link #KIND_ON_DELIVERY}
     * @param deliveryMethods CSV of WAREHOUSE, POSTOMAT, DOORS, PICKUP it is offered for; null = all
     */
    record Option(byte[] id, String title, boolean requiresPrepayment, long prepaymentMinor,
                  String kind, String deliveryMethods) {

        public Option(byte[] id, String title, boolean requiresPrepayment, long prepaymentMinor) {
            this(id, title, requiresPrepayment, prepaymentMinor, null, null);
        }

        public boolean onDelivery() {
            return KIND_ON_DELIVERY.equals(kind);
        }

        /** Whether it may be chosen for this delivery key (WAREHOUSE / POSTOMAT / DOORS / PICKUP). */
        public boolean allowsDelivery(String deliveryKey) {
            if (deliveryMethods == null || deliveryMethods.isBlank()) {
                return true;
            }
            for (String m : deliveryMethods.split(",")) {
                if (m.trim().equalsIgnoreCase(deliveryKey)) {
                    return true;
                }
            }
            return false;
        }
    }
}
