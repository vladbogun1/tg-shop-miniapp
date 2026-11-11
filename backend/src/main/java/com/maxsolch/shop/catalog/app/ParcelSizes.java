package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.catalog.domain.CatalogError;
import com.maxsolch.shop.catalog.domain.Category;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.catalog.infra.CategoryRepository;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Weight (g) and box (mm) of products, variants and categories for Nova Poshta waybills (V98): the admin edits them
 * on «Вес и коробки», the delivery module reads the inherited size of a unit (variant → product → category and its
 * parents; null where none of them has it — the delivery settings' defaults apply then).
 */
@Service
public class ParcelSizes {

    private static final int MAX_DEPTH = 8;

    private final ProductRepository products;
    private final CategoryRepository categories;
    private final AdminAuditService audit;

    public ParcelSizes(ProductRepository products, CategoryRepository categories, AdminAuditService audit) {
        this.products = products;
        this.categories = categories;
        this.audit = audit;
    }

    /** Grams and millimetres; null = inherit (variant → product → category → settings). */
    public record Size(Integer weightG, Integer lengthMm, Integer widthMm, Integer heightMm) {
    }

    public record VariantSize(String id, String name, Size size) {
    }

    public record ProductSize(String id, Size size, List<VariantSize> variants, String categoryId) {
    }

    public record CategorySize(String id, String parentId, String name, Size size) {
    }

    /**
     * One unit of goods as the parcel needs it.
     *
     * @param weightG        inherited weight, null = none set anywhere
     * @param box            inherited box {l, w, h}, null = none set anywhere
     * @param categorySlugs  the product's category and its parents (lower case), for «Документи»
     */
    public record UnitSize(@Nullable Integer weightG, @Nullable int[] box, List<String> categorySlugs) {
    }

    /** The inherited size of one unit; an unknown product = nothing known (defaults). */
    @Transactional(readOnly = true)
    public UnitSize unit(byte[] productId, @Nullable byte[] variantId) {
        return unit(productId, variantId, new HashMap<>());
    }

    private UnitSize unit(byte[] productId, @Nullable byte[] variantId, Map<String, Category> cache) {
        Product product = productId == null ? null : products.findById(productId).orElse(null);
        if (product == null) {
            return new UnitSize(null, null, List.of());
        }
        ProductVariant variant = variantId == null || product.getVariants() == null ? null
                : product.getVariants().stream().filter(v -> Arrays.equals(v.getId(), variantId)).findFirst()
                        .orElse(null);
        Integer weight = null;
        int[] box = null;
        if (variant != null) {
            weight = variant.getWeightG();
            box = box(variant.getLengthMm(), variant.getWidthMm(), variant.getHeightMm());
        }
        weight = weight != null ? weight : product.getWeightG();
        box = box != null ? box : box(product.getLengthMm(), product.getWidthMm(), product.getHeightMm());
        List<String> slugs = new ArrayList<>();
        byte[] catId = product.getCategoryId();
        for (int depth = 0; catId != null && depth < MAX_DEPTH; depth++) {
            Category c = category(catId, cache);
            if (c == null) {
                break;
            }
            if (c.getSlug() != null) {
                slugs.add(c.getSlug().toLowerCase(Locale.ROOT));
            }
            weight = weight != null ? weight : c.getWeightG();
            box = box != null ? box : box(c.getLengthMm(), c.getWidthMm(), c.getHeightMm());
            catId = c.getParentId();
        }
        return new UnitSize(weight != null && weight > 0 ? weight : null, box, slugs);
    }

    private Category category(byte[] id, Map<String, Category> cache) {
        return cache.computeIfAbsent(UuidUtil.toString(id), k -> categories.findById(id).orElse(null));
    }

    private static int[] box(Integer l, Integer w, Integer h) {
        return l != null && w != null && h != null && l > 0 && w > 0 && h > 0 ? new int[] {l, w, h} : null;
    }

    // ------------------------------------------------------------------ admin

    @Transactional(readOnly = true)
    public ProductSize productSize(String id) {
        return toProductSize(product(id));
    }

    @Transactional
    public ProductSize saveProductSize(String id, ProductSize body) {
        Product p = product(id);
        Size s = check(body == null ? null : body.size());
        p.changeParcelSize(s.weightG(), s.lengthMm(), s.widthMm(), s.heightMm());
        if (body != null && body.variants() != null) {
            for (VariantSize vs : body.variants()) {
                if (vs == null || vs.id() == null) {
                    continue;
                }
                byte[] vid = UuidUtil.toBytes(vs.id());
                ProductVariant v = p.getVariants().stream().filter(x -> Arrays.equals(x.getId(), vid)).findFirst()
                        .orElseThrow(() -> new DomainException.BadRequest(CatalogError.VARIANT_NOT_FOUND_IN_PRODUCT,
                                vs.id()));
                Size z = check(vs.size());
                v.changeParcelSize(z.weightG(), z.lengthMm(), z.widthMm(), z.heightMm());
            }
        }
        products.save(p);
        audit.record("PRODUCT_PARCEL_SIZE", "PRODUCT", id, "вес/габариты: " + describe(s));
        return toProductSize(p);
    }

    @Transactional(readOnly = true)
    public List<CategorySize> categorySizes() {
        return categories.findAll().stream()
                .sorted(Comparator.comparing(Category::getSortOrder).thenComparing(Category::getName))
                .map(ParcelSizes::toCategorySize)
                .toList();
    }

    @Transactional
    public CategorySize saveCategorySize(String id, Size body) {
        Category c = categories.findById(UuidUtil.toBytes(id))
                .orElseThrow(() -> new DomainException.NotFound(CatalogError.CATEGORY_NOT_FOUND));
        Size s = check(body);
        c.changeParcelSize(s.weightG(), s.lengthMm(), s.widthMm(), s.heightMm());
        categories.save(c);
        audit.record("CATEGORY_PARCEL_SIZE", "CATEGORY", id, c.getName() + ": " + describe(s));
        return toCategorySize(c);
    }

    private Product product(String id) {
        return products.findById(UuidUtil.toBytes(id))
                .orElseThrow(() -> new DomainException.NotFound(CatalogError.PRODUCT_NOT_FOUND));
    }

    private static ProductSize toProductSize(Product p) {
        return new ProductSize(UuidUtil.toString(p.getId()),
                new Size(p.getWeightG(), p.getLengthMm(), p.getWidthMm(), p.getHeightMm()),
                p.getVariants().stream()
                        .map(v -> new VariantSize(UuidUtil.toString(v.getId()), v.getName(),
                                new Size(v.getWeightG(), v.getLengthMm(), v.getWidthMm(), v.getHeightMm())))
                        .toList(),
                p.getCategoryId() == null ? null : UuidUtil.toString(p.getCategoryId()));
    }

    private static CategorySize toCategorySize(Category c) {
        return new CategorySize(UuidUtil.toString(c.getId()),
                c.getParentId() == null ? null : UuidUtil.toString(c.getParentId()), c.getName(),
                new Size(c.getWeightG(), c.getLengthMm(), c.getWidthMm(), c.getHeightMm()));
    }

    /** Weight 1 g … 1000 kg; the box all three or none, each 1 mm … 3 m; 0 = empty. */
    static Size check(Size s) {
        if (s == null) {
            return new Size(null, null, null, null);
        }
        Integer w = zeroToNull(s.weightG());
        if (w != null && (w < 1 || w > 1_000_000)) {
            throw new DomainException.BadRequest(CatalogError.PARCEL_WEIGHT_RANGE);
        }
        Integer l = zeroToNull(s.lengthMm());
        Integer wi = zeroToNull(s.widthMm());
        Integer h = zeroToNull(s.heightMm());
        int given = (l == null ? 0 : 1) + (wi == null ? 0 : 1) + (h == null ? 0 : 1);
        if (given != 0 && given != 3) {
            throw new DomainException.BadRequest(CatalogError.PARCEL_BOX_PARTIAL);
        }
        for (Integer d : new Integer[] {l, wi, h}) {
            if (d != null && (d < 1 || d > 3000)) {
                throw new DomainException.BadRequest(CatalogError.PARCEL_BOX_RANGE);
            }
        }
        return new Size(w, l, wi, h);
    }

    private static Integer zeroToNull(Integer v) {
        return v == null || v == 0 ? null : v;
    }

    private static String describe(Size s) {
        String w = s.weightG() == null ? "вес по умолчанию" : s.weightG() + " г";
        String d = s.lengthMm() == null ? "коробка по умолчанию"
                : s.lengthMm() + "×" + s.widthMm() + "×" + s.heightMm() + " мм";
        return w + ", " + d;
    }
}
