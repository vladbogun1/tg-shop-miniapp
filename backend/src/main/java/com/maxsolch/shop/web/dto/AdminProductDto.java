package com.maxsolch.shop.web.dto;

import com.maxsolch.shop.catalog.CatalogDtos.BrandRefDto;
import com.maxsolch.shop.catalog.SpecsValidator;

import java.util.List;
import java.util.Map;

/**
 * A product as the admin edits it. {@code tags} = the category path (legacy shape), {@code brand} =
 * brandRef.name. {@code specIssues} is set only in the answer to a save (what the validator dropped).
 */
public record AdminProductDto(
        String id,
        String title,
        String description,
        long priceMinor,
        String currency,
        int stock,
        boolean active,
        boolean archived,
        List<ProductImageDto> images,
        List<ProductVariantDto> variants,
        List<TagDto> tags,
        String slug,
        Long compareAtMinor,
        String seoTitle,
        String seoDescription,
        String brand,
        String sku,
        // ---- catalog v2 ----
        String categoryId,
        BrandRefDto brandRef,
        String condition,
        String conditionNote,
        Map<String, Object> specs,
        String cardStatus,
        Integer cardConfidence,
        Map<String, Object> cardMeta,
        /** Required attributes of the category path without a value. */
        List<String> missingRequired,
        List<SpecsValidator.Issue> specIssues) {

    public AdminProductDto withSpecIssues(List<SpecsValidator.Issue> issues) {
        return new AdminProductDto(id, title, description, priceMinor, currency, stock, active, archived, images,
                variants, tags, slug, compareAtMinor, seoTitle, seoDescription, brand, sku, categoryId, brandRef,
                condition, conditionNote, specs, cardStatus, cardConfidence, cardMeta, missingRequired, issues);
    }
}
