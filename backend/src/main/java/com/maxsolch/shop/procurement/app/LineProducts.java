package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.repository.ProductRepository;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;

/** Products of batch lines or queue places, by id text, in one query. */
@Component
public class LineProducts {

    private final ProductRepository products;

    public LineProducts(ProductRepository products) {
        this.products = products;
    }

    public Map<String, Product> productsOf(Collection<byte[]> ids) {
        Map<String, Product> out = new HashMap<>();
        if (ids.isEmpty()) {
            return out;
        }
        for (Product p : products.findAllById(ids)) {
            out.put(UuidUtil.toString(p.getId()), p);
        }
        return out;
    }
}
