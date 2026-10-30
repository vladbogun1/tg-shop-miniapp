package com.maxsolch.shop.catalog.app;

import java.util.Map;

/** Units kept for people in a pre-order queue (not shown as in stock); implemented by the preorder module. */
public interface HeldUnits {

    /** {@link com.maxsolch.shop.catalog.domain.LineKey} to held units. */
    Map<String, Integer> heldByLine();
}
