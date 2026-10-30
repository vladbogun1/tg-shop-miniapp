package com.maxsolch.shop.catalog.app;

import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.lang.Nullable;

import com.maxsolch.shop.catalog.app.CatalogDtos.BrandRefDto;
import com.maxsolch.shop.catalog.domain.CardStatus;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.SpecsJson;
import com.maxsolch.shop.catalog.domain.SpecsValidator;
import com.maxsolch.shop.platform.util.UuidUtil;

import java.util.List;
import java.util.Map;

/**
 * A product as the admin edits it. {@code tags} = the category path (legacy shape), {@code brand} =
 * brandRef.name. {@code specIssues} is set only in the answer to a save (what the validator dropped).
 */
public record AdminProductDto(
        String id,
        String title,
        @Nullable String description,
        long priceMinor,
        String currency,
        int stock,
        boolean active,
        boolean archived,
        @Nullable List<ProductImageDto> images,
        @Nullable List<ProductVariantDto> variants,
        @Nullable List<TagDto> tags,
        @Nullable String slug,
        @Nullable Long compareAtMinor,
        @Nullable String seoTitle,
        @Nullable String seoDescription,
        String brand,
        @Nullable String sku,
        // ---- catalog v2 ----
        String categoryId,
        @Nullable BrandRefDto brandRef,
        @Schema(implementation = com.maxsolch.shop.catalog.domain.ProductCondition.class) @Nullable String condition,
        @Nullable String conditionNote,
        Map<String, Object> specs,
        @Schema(implementation = com.maxsolch.shop.catalog.domain.CardStatus.class) String cardStatus,
        @Nullable Integer cardConfidence,
        Map<String, Object> cardMeta,
        /** Required attributes of the category path without a value. */
        List<String> missingRequired,
        List<SpecsValidator.Issue> specIssues,
        /** Created and never published (V53), the «Незавершённые» list. */
        boolean unfinished,
        /** Distinct people waiting for the product in any variant (WAITING/HELD), filled in the list only. */
        int waitingPeople,
        /** Units they wait for. */
        int waitingQty) {

    /** The product as the admin sees it; {@code specIssues} and the waiting counts are filled by the caller. */
    static AdminProductDto of(Product p, CatalogSnapshot catalog) {
        List<ProductImageDto> images = p.getImages().stream()
                .map(i -> new ProductImageDto(i.getId(), i.getUrl(), i.getSortOrder()))
                .toList();
        List<ProductVariantDto> variants = p.getVariants().stream()
                .map(v -> new ProductVariantDto(UuidUtil.toString(v.getId()), v.getName(), v.getStock(), v.getSortOrder()))
                .toList();
        String categoryId = ProductCatalogFields.categoryId(p);
        BrandRefDto brandRef = ProductCatalogFields.brandRef(catalog, ProductCatalogFields.brandId(p));
        Map<String, Object> specs = ProductCatalogFields.specs(p);
        return new AdminProductDto(
                UuidUtil.toString(p.getId()),
                p.getTitle(),
                p.getDescription(),
                p.getPriceMinor(),
                p.getCurrency(),
                p.getStock(),
                p.isActive(),
                p.isArchived(),
                images,
                variants,
                ProductCatalogFields.tags(catalog, categoryId),
                p.getSlug(),
                p.getCompareAtMinor(),
                p.getSeoTitle(),
                p.getSeoDescription(),
                brandRef == null ? null : brandRef.name(),
                p.getSku(),
                categoryId,
                brandRef,
                ProductCatalogFields.condition(p),
                p.getConditionNote(),
                specs,
                (p.getCardStatus() == null ? CardStatus.DRAFT : p.getCardStatus()).name(),
                p.getCardConfidence(),
                SpecsJson.readMap(p.getCardMetaJson()),
                catalog.missingRequired(categoryId, specs),
                null,
                p.isUnfinished(),
                0,
                0);
    }

    public AdminProductDto withWaiting(int people, int qty) {
        return new AdminProductDto(id, title, description, priceMinor, currency, stock, active, archived, images,
                variants, tags, slug, compareAtMinor, seoTitle, seoDescription, brand, sku, categoryId, brandRef,
                condition, conditionNote, specs, cardStatus, cardConfidence, cardMeta, missingRequired, specIssues,
                unfinished, people, qty);
    }

    public AdminProductDto withSpecIssues(List<SpecsValidator.Issue> issues) {
        return new AdminProductDto(id, title, description, priceMinor, currency, stock, active, archived, images,
                variants, tags, slug, compareAtMinor, seoTitle, seoDescription, brand, sku, categoryId, brandRef,
                condition, conditionNote, specs, cardStatus, cardConfidence, cardMeta, missingRequired, issues,
                unfinished, waitingPeople, waitingQty);
    }
}
