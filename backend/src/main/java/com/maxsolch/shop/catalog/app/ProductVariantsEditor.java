package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.CatalogErrors;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.platform.util.UuidUtil;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Edits the variants of a product from the admin form: matching, stock roll-up and the lost-update guard. */
final class ProductVariantsEditor {

    private ProductVariantsEditor() {
    }

    /**
     * Reconciles variants instead of recreating them.
     *
     * <p>The previous clear + re-insert handed every variant a brand new UUID on each save, which
     * silently broke anything holding the old one: persisted carts in customers' browsers and the
     * {@code order_items.variant_id} of existing orders. Matching is by id when the client sends
     * one, then by name (the admin UI historically sent no ids at all), so existing rows keep their
     * identity either way; only genuinely removed variants are deleted.
     */
    static List<byte[]> apply(Product p, ProductUpsertRequest req, List<ProductStock.StockDrop> drops) {
        if (req.variants() == null) {
            return List.of();
        }
        Map<String, ProductVariant> byId = new LinkedHashMap<>();
        Map<String, ProductVariant> byName = new LinkedHashMap<>();
        for (ProductVariant v : p.getVariants()) {
            byId.put(UuidUtil.toString(v.getId()), v);
            byName.putIfAbsent(normalized(v.getName()), v);
        }

        // Resolve every incoming variant to an existing row (by id, else by name) or a new one.
        List<ProductVariant> keep = new ArrayList<>();
        int order = 0;
        int rollup = 0;
        for (ProductUpsertRequest.VariantInput vi : req.variants()) {
            if (vi.name() == null || vi.name().isBlank()) {
                continue;
            }
            ProductVariant v = null;
            if (vi.id() != null && !vi.id().isBlank()) {
                v = byId.remove(vi.id().trim());
                if (v != null) {
                    byName.remove(normalized(v.getName()));
                }
            }
            if (v == null) {
                v = byName.remove(normalized(vi.name()));
                if (v != null) {
                    byId.remove(UuidUtil.toString(v.getId()));
                }
            }
            if (v == null) {
                v = new ProductVariant();
                v.setProduct(p);
                p.getVariants().add(v);
            }
            v.setName(vi.name().trim());
            if (vi.stock() != null) {
                if (v.getId() != null) {
                    checkStock(v.getStock(), vi.stock(), vi.expectedStock(),
                            p.getTitle() + " / " + v.getName());
                    if (drops != null && vi.stock() < v.getStock()) {
                        drops.add(new ProductStock.StockDrop(v.getId(), v.getName(), v.getStock() - vi.stock()));
                    }
                }
                v.setStock(vi.stock());
            }
            v.setSortOrder(order++);
            keep.add(v);
            rollup += v.getStock();
        }

        // Anything not matched was removed by the admin (orphanRemoval deletes the rows).
        List<byte[]> removed = p.getVariants().stream()
                .filter(v -> !keep.contains(v) && v.getId() != null)
                .map(ProductVariant::getId)
                .toList();
        p.getVariants().removeIf(v -> !keep.contains(v));

        // Product stock is the rollup of variant stock whenever variants exist (OrderStock
        // relies on the same invariant when reserving/releasing units).
        if (!p.getVariants().isEmpty()) {
            p.setStock(rollup);
        }
        return removed;
    }

    /**
     * Lost-update guard for stock (A5): the form sends the value it was opened with as
     * {@code expected}; if the stored value moved since (an order reserved or released units)
     * and the admin is changing it, reject instead of overwriting. No-op when nothing changes
     * or the client sent no expectation.
     */
    static void checkStock(int current, int requested, Integer expected, String label) {
        if (expected == null || requested == current || expected == current) {
            return;
        }
        throw CatalogErrors.conflict("Остаток «" + label + "» изменился (было " + expected
                + ", стало " + current + ") — обновите", "STOCK_CONFLICT");
    }

    private static String normalized(String name) {
        return name == null ? "" : name.trim().toLowerCase(java.util.Locale.ROOT);
    }
}
