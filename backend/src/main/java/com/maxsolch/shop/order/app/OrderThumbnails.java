package com.maxsolch.shop.order.app;

import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.catalog.domain.ProductImage;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** First photo of each product on an order page, for order cards, details and dispatch rows. */
@Component
public class OrderThumbnails {

    private final Products productImages;

    public OrderThumbnails(Products productImages) {
        this.productImages = productImages;
    }

    /** One query for all the line thumbnails instead of one per line. */
    public Map<String, String> of(List<OrderItem> items) {
        List<byte[]> productIds = new ArrayList<>();
        for (OrderItem it : items) {
            if (it.getProductId() != null) {
                productIds.add(it.getProductId());
            }
        }
        if (productIds.isEmpty()) {
            return Map.of();
        }
        Map<String, String> first = new HashMap<>();
        for (ProductImage image : productImages.findImagesForProducts(productIds)) {
            // Results are ordered by sortOrder, so the first one seen per product wins.
            first.putIfAbsent(UuidUtil.toString(image.getProduct().getId()), image.getUrl());
        }
        return first;
    }
}
