package com.maxsolch.shop.promo.app;

/**
 * What promo codes need to know about orders, which the order module answers (promo is below order and does not
 * import it): a code that any order carries is history and cannot be deleted.
 */
public interface PromoUsage {

    /** True when at least one order was placed with this code text. */
    boolean usedInOrders(String code);
}
