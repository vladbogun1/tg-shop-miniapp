package com.maxsolch.shop.gift;

import com.maxsolch.shop.catalog.domain.Brand;
import com.maxsolch.shop.catalog.app.Taxonomy;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Products the shop earns (almost) nothing on — whole brands ({@code gift.lowMarginBrands}, slugs) and
 * single products ({@code gift.lowMarginProducts}, ids); docs/GIFT-CASE.md, «Товары с упором на скидки».
 * An order with one still gets its case, but product prizes drop rarer
 * ({@code gift_case_tiers.low_margin_product_percent}), and a promo code the case gave does not apply
 * to these products.
 */
@Service
public class CaseLowMargin {

    private final SettingsService settings;
    private final Taxonomy brands;
    private final Products products;

    public CaseLowMargin(SettingsService settings, Taxonomy brands, Products products) {
        this.settings = settings;
        this.brands = brands;
        this.products = products;
    }

    /** Brand slugs from the setting, lower case, in order. */
    public List<String> brandSlugs() {
        return csv(SettingsRegistry.GIFT_LOW_MARGIN_BRANDS);
    }

    /** Product ids marked one by one, lower case, in order. */
    public List<String> productIdsMarked() {
        return csv(SettingsRegistry.GIFT_LOW_MARGIN_PRODUCTS);
    }

    /** The marked brands that exist. */
    @Transactional(readOnly = true)
    public List<Brand> brands() {
        return brandSlugs().stream().map(brands::brandBySlug).flatMap(Optional::stream).toList();
    }

    /** Every low-margin product id: of the marked brands and marked one by one. */
    @Transactional(readOnly = true)
    public Set<String> productIds() {
        Set<String> out = new LinkedHashSet<>(productIdsMarked());
        List<byte[]> brandIds = brands().stream().map(Brand::getId).toList();
        if (!brandIds.isEmpty()) {
            products.findByBrandIdIn(brandIds).forEach(p -> out.add(UuidUtil.toString(p.getId())));
        }
        return out;
    }

    /** Nothing is marked: the case works as before, no lookups needed. */
    public boolean none() {
        return brandSlugs().isEmpty() && productIdsMarked().isEmpty();
    }

    /** Is any of these products low-margin. */
    @Transactional(readOnly = true)
    public boolean any(Collection<Product> ps) {
        if (none() || ps.isEmpty()) {
            return false;
        }
        Set<String> ids = productIds();
        return ps.stream().anyMatch(p -> ids.contains(UuidUtil.toString(p.getId())));
    }

    /**
     * The part of a cart (product id → quantity) that a case promo code does not touch: price × quantity
     * of its low-margin products, at the current prices. Unknown ids count as 0.
     */
    @Transactional(readOnly = true)
    public long excludedMinor(Map<String, Integer> quantities) {
        if (none() || quantities.isEmpty()) {
            return 0;
        }
        Set<String> ids = productIds();
        long sum = 0;
        for (Map.Entry<String, Integer> e : quantities.entrySet()) {
            String id = e.getKey().trim().toLowerCase(Locale.ROOT);
            if (!ids.contains(id) || e.getValue() == null || e.getValue() <= 0) {
                continue;
            }
            byte[] bytes;
            try {
                bytes = UuidUtil.toBytes(id);
            } catch (IllegalArgumentException ex) {
                continue;
            }
            long price = products.findById(bytes).map(Product::getPriceMinor).orElse(0L);
            sum += price * e.getValue();
        }
        return sum;
    }

    /**
     * {@code id*qty,id*qty} of the cart preview (the cart sends its lines with the promo check), product
     * id → quantity; malformed parts are skipped.
     */
    public static Map<String, Integer> parseItems(String items) {
        if (items == null || items.isBlank()) {
            return Map.of();
        }
        return Arrays.stream(items.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(s -> s.split("\\*", 2))
                .filter(a -> a.length == 2 && !a[0].isBlank())
                .map(a -> {
                    try {
                        return Map.entry(a[0].trim().toLowerCase(Locale.ROOT), Integer.parseInt(a[1].trim()));
                    } catch (NumberFormatException e) {
                        return null;
                    }
                })
                .filter(e -> e != null && e.getValue() > 0)
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, Integer::sum));
    }

    private List<String> csv(String key) {
        String raw = settings.getString(key);
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return Arrays.stream(raw.split(","))
                .map(s -> s.trim().toLowerCase(Locale.ROOT))
                .filter(s -> !s.isEmpty())
                .distinct()
                .toList();
    }
}
