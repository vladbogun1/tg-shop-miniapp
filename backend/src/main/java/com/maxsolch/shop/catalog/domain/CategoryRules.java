package com.maxsolch.shop.catalog.domain;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.ToLongFunction;

/**
 * Invariants of the category tree (docs/CATALOG-SPECS.md §0.1, §3.2), checked after every change of
 * the tree: at most two levels, products only in leaves, attribute keys unique along every path.
 */
public final class CategoryRules {


    private CategoryRules() {
    }

    /**
     * @param categories every category, in their new state
     * @param directProducts products directly in a category (by id)
     */
    public static void checkTree(List<Category> categories, ToLongFunction<byte[]> directProducts) {
        Map<String, Category> byId = new HashMap<>();
        for (Category c : categories) {
            byId.put(UuidUtil.toString(c.getId()), c);
        }
        Set<String> parents = new HashSet<>();
        for (Category c : categories) {
            if (c.getParentId() == null) {
                continue;
            }
            String pid = UuidUtil.toString(c.getParentId());
            Category parent = byId.get(pid);
            if (parent == null) {
                throw new DomainException.BadRequest(CatalogError.IMPORT_NO_PARENT, c.getSlug(), pid);
            }
            if (pid.equals(UuidUtil.toString(c.getId()))) {
                throw new DomainException.Conflict(CatalogError.CATEGORY_TOO_DEEP_SELF_PARENT, c.getSlug());
            }
            if (parent.getParentId() != null) {
                throw new DomainException.Conflict(CatalogError.CATEGORY_TOO_DEEP, parent.getSlug(), c.getSlug());
            }
            parents.add(pid);
        }
        for (String pid : parents) {
            Category parent = byId.get(pid);
            long count = directProducts.applyAsLong(parent.getId());
            if (count > 0) {
                throw new DomainException.Conflict(CatalogError.CATEGORY_HAS_PRODUCTS_PARENT, parent.getSlug(), String.valueOf(count));
            }
        }
    }

    /** Every attribute key is unique among the global attributes and along each category path. */
    public static void checkKeys(CatalogSnapshot s) {
        Set<String> global = new HashSet<>();
        for (CatalogSnapshot.Attr a : s.attributes()) {
            if (a.categoryId() == null && !global.add(a.key())) {
                throw new DomainException.Conflict(CatalogError.ATTRIBUTE_KEY_TAKEN_GLOBAL, a.key());
            }
        }
        for (CatalogSnapshot.Cat c : s.categories()) {
            Set<String> keys = new HashSet<>();
            for (CatalogSnapshot.Attr a : s.attributesFor(c.id())) {
                if (!keys.add(a.key())) {
                    throw new DomainException.Conflict(CatalogError.ATTRIBUTE_KEY_TAKEN_IN_PATH, a.key(), c.slug());
                }
            }
        }
    }
}
