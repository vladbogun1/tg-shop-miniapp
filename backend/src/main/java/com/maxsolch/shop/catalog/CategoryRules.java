package com.maxsolch.shop.catalog;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.ConflictException;

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

    public static final String HAS_PRODUCTS = "CATEGORY_HAS_PRODUCTS";
    public static final String HAS_CHILDREN = "CATEGORY_HAS_CHILDREN";
    public static final String TOO_DEEP = "CATEGORY_TOO_DEEP";
    public static final String KEY_TAKEN = "ATTRIBUTE_KEY_TAKEN";

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
                throw new BadRequestException("категория «" + c.getSlug() + "»: нет родителя " + pid);
            }
            if (pid.equals(UuidUtil.toString(c.getId()))) {
                throw new ConflictException("категория «" + c.getSlug() + "» не может быть родителем самой себе",
                        TOO_DEEP);
            }
            if (parent.getParentId() != null) {
                throw new ConflictException("не больше двух уровней: «" + parent.getSlug()
                        + "» уже подкатегория, в неё нельзя вложить «" + c.getSlug() + "»", TOO_DEEP);
            }
            parents.add(pid);
        }
        for (String pid : parents) {
            Category parent = byId.get(pid);
            long count = directProducts.applyAsLong(parent.getId());
            if (count > 0) {
                throw new ConflictException("в категории «" + parent.getSlug() + "» лежат товары (" + count
                        + ") — у категории с подкатегориями товаров быть не может; сначала перенесите их",
                        HAS_PRODUCTS);
            }
        }
    }

    /** Every attribute key is unique among the global attributes and along each category path. */
    public static void checkKeys(CatalogSnapshot s) {
        Set<String> global = new HashSet<>();
        for (CatalogSnapshot.Attr a : s.attributes()) {
            if (a.categoryId() == null && !global.add(a.key())) {
                throw new ConflictException("ключ «" + a.key() + "» дважды среди глобальных характеристик", KEY_TAKEN);
            }
        }
        for (CatalogSnapshot.Cat c : s.categories()) {
            Set<String> keys = new HashSet<>();
            for (CatalogSnapshot.Attr a : s.attributesFor(c.id())) {
                if (!keys.add(a.key())) {
                    throw new ConflictException("ключ «" + a.key() + "» повторяется в пути категории «" + c.slug()
                            + "» (у родителя или среди глобальных)", KEY_TAKEN);
                }
            }
        }
    }
}
