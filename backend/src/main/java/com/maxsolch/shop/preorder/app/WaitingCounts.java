package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.preorder.infra.PreorderSubscriptionRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

/** How many people wait for a product: what the admin product list shows next to the stock. */
@Component
public class WaitingCounts {

    private final PreorderSubscriptionRepository subs;

    public WaitingCounts(PreorderSubscriptionRepository subs) {
        this.subs = subs;
    }

    /** Product id text -> {distinct people, units} waiting (or holding) for it, any variant. */
    @Transactional(readOnly = true)
    public Map<String, int[]> byProduct() {
        Map<String, int[]> out = new HashMap<>();
        for (Object[] r : subs.waitingByProduct()) {
            out.put(UuidUtil.toString((byte[]) r[0]), new int[]{((Number) r[1]).intValue(), ((Number) r[2]).intValue()});
        }
        return out;
    }
}
