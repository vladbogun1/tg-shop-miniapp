package com.maxsolch.shop.order.app;

import com.maxsolch.shop.catalog.app.SalesStats;
import com.maxsolch.shop.order.infra.OrderItemRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * Units sold per product for the catalog.
 *
 * <p>{@code soldCount} shipped as a hardcoded {@code 0}, which quietly broke the catalog's default "popular first"
 * sort and the admin's "Sales" column. One grouped query; the catalog caches the result with its products.
 */
@Component
class OrderSalesStats implements SalesStats {

    private final OrderItemRepository orderItemRepository;

    OrderSalesStats(OrderItemRepository orderItemRepository) {
        this.orderItemRepository = orderItemRepository;
    }

    @Override
    public Map<String, Long> soldByProduct() {
        Map<String, Long> sold = new HashMap<>();
        for (Object[] row : orderItemRepository.soldCountsByProduct()) {
            if (row[0] != null) {
                sold.put(UuidUtil.toString((byte[]) row[0]), ((Number) row[1]).longValue());
            }
        }
        return sold;
    }
}
