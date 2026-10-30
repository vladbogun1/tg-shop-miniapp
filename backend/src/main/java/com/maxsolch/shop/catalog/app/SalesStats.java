package com.maxsolch.shop.catalog.app;

import java.util.Map;

/** Sales figures the catalog sorts by; implemented by the order module. */
public interface SalesStats {

    /** Product id to units sold. */
    Map<String, Long> soldByProduct();
}
