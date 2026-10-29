package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.translation.app.TranslationService.Overlay;
import com.maxsolch.shop.translation.domain.TranslationEntityType;

import java.util.List;

/**
 * Applies a language's translations to the catalog read models. The translation module only knows texts;
 * which fields of a product, variant or category are translated is the catalog's business.
 */
public final class CatalogOverlay {

    private CatalogOverlay() {
    }

    public static ProductDto product(Overlay overlay, ProductDto p) {
        if (!overlay.active() || p == null) {
            return p;
        }
        String id = p.id();
        List<ProductVariantDto> variants = p.variants() == null ? null : p.variants().stream()
                .map(v -> new ProductVariantDto(v.id(),
                        overlay.text(TranslationEntityType.VARIANT, v.id(), TranslationEntityType.NAME, v.name()),
                        v.stock(), v.sortOrder()))
                .toList();
        List<TagDto> tags = p.tags() == null ? null : p.tags().stream().map(t -> tag(overlay, t)).toList();
        return new ProductDto(
                id,
                overlay.text(TranslationEntityType.PRODUCT, id, TranslationEntityType.TITLE, p.title()),
                overlay.text(TranslationEntityType.PRODUCT, id, TranslationEntityType.DESCRIPTION, p.description()),
                p.priceMinor(),
                p.currency(),
                p.stock(),
                p.active(),
                p.soldCount(),
                p.images(),
                variants,
                tags,
                p.slug(),
                p.compareAtMinor(),
                overlay.text(TranslationEntityType.PRODUCT, id, TranslationEntityType.SEO_TITLE, p.seoTitle()),
                overlay.text(TranslationEntityType.PRODUCT, id, TranslationEntityType.SEO_DESCRIPTION,
                        p.seoDescription()),
                p.createdAt(),
                p.brand(),
                p.sku(),
                p.ratingAvg(),
                p.ratingCount(),
                p.categoryId(),
                p.brandRef(),
                p.condition(),
                overlay.text(TranslationEntityType.PRODUCT, id, TranslationEntityType.CONDITION_NOTE,
                        p.conditionNote()),
                p.specs());
    }

    public static List<ProductDto> products(Overlay overlay, List<ProductDto> list) {
        return overlay.active() ? list.stream().map(p -> product(overlay, p)).toList() : list;
    }

    public static TagDto tag(Overlay overlay, TagDto t) {
        if (!overlay.active() || t == null) {
            return t;
        }
        return new TagDto(t.id(),
                overlay.text(TranslationEntityType.CATEGORY, t.id(), TranslationEntityType.NAME, t.name()),
                t.slug(), t.sortOrder(), t.showInMenu());
    }

    public static List<TagDto> tags(Overlay overlay, List<TagDto> list) {
        return overlay.active() ? list.stream().map(t -> tag(overlay, t)).toList() : list;
    }
}
