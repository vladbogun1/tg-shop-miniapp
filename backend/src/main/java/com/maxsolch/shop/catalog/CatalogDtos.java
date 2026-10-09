package com.maxsolch.shop.catalog;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

/**
 * JSON shapes of catalog v2. The storefront ones mirror {@code shared/src/catalog.ts} field by field
 * (CatalogSchema, CatalogCategory, CatalogBrand, SpecAttribute, SpecGroup, ProductBrandRef).
 */
public final class CatalogDtos {

    private CatalogDtos() {
    }

    // ------------------------------------------------------------------ storefront

    public record CatalogCategoryDto(String id, String slug, String name, String parentId, int sortOrder,
                                     boolean showInMenu, String artKind, long productCount) {
    }

    public record CatalogBrandDto(String id, String slug, String name, long productCount) {
    }

    public record SpecGroupDto(String key, String label, int sort) {
    }

    public record SpecOptionDto(String value, String label, int sort) {
    }

    public record FacetBucketDto(String id, String label, Double min, Double max) {
    }

    public record SpecAttributeDto(String id, String key, String label, String type, String unit, boolean range,
                                   String group, boolean filterable, boolean comparable, boolean required,
                                   boolean highlight, int sort, String categoryId, List<SpecOptionDto> options,
                                   List<FacetBucketDto> buckets, String hint) {
    }

    public record ConditionDto(String value, String label) {
    }

    public record CatalogSchemaDto(List<CatalogCategoryDto> categories, List<CatalogBrandDto> brands,
                                   List<SpecGroupDto> groups, List<SpecAttributeDto> attributes,
                                   List<ConditionDto> conditions) {
    }

    /** {@code brandRef} of every product DTO. */
    public record BrandRefDto(String id, String slug, String name) {
    }

    // ------------------------------------------------------------------ admin: categories

    public record AdminCategoryDto(String id, String slug, String name, String parentId, int sortOrder,
                                   boolean showInMenu, String artKind,
                                   /** Active products in the category and its descendants. */
                                   long productCount,
                                   /** Non-archived products directly in this category. */
                                   long productCountDirect,
                                   boolean leaf, int depth,
                                   String seoTitle, String seoDescription, String h1, String introText) {
    }

    /**
     * Create / edit a category. {@code null} = keep (on create: defaults). {@code parentId}: on PATCH
     * {@code null} keeps the parent, {@code ""} makes it a root. Blank slug = generated from the name.
     * SEO: blank clears.
     */
    public record CategoryUpsertRequest(
            @Size(max = 128) String name,
            @Size(max = 160) String slug,
            String parentId,
            Integer sortOrder,
            Boolean showInMenu,
            @Size(max = 32) String artKind,
            @Size(max = 255) String seoTitle,
            @Size(max = 512) String seoDescription,
            @Size(max = 255) String h1,
            @Size(max = INTRO_MAX_CHARS) String introText) {

        /** ~600 words of Ukrainian/Russian is ~4–5 k characters; leave room, stay well inside TEXT. */
        public static final int INTRO_MAX_CHARS = 10_000;
    }

    /** One row of {@code PATCH /api/admin/categories/reorder}; {@code parentId} null = root. */
    public record ReorderItem(@NotBlank String id, String parentId, Integer sortOrder) {
    }

    // ------------------------------------------------------------------ admin: brands

    public record AdminBrandDto(String id, String name, String slug, List<String> aliases, String website,
                                int sortOrder, long productCount) {
    }

    public record BrandUpsertRequest(@Size(max = 128) String name, @Size(max = 160) String slug,
                                     @Size(max = 200) List<@Size(max = 128) String> aliases,
                                     @Size(max = 255) String website, Integer sortOrder) {
    }

    // ------------------------------------------------------------------ admin: attributes

    public record AdminBucketDto(String id, Double min, Double max, String labelRu, String labelUk, String labelEn) {
    }

    public record AdminOptionDto(String value, String labelRu, String labelUk, String labelEn, List<String> aliases,
                                 int sort, long usedCount) {
    }

    public record AdminSpecAttributeDto(String id, String categoryId, String key, String labelRu, String labelUk,
                                        String labelEn, String type, String unitRu, String unitUk, String unitEn,
                                        boolean range, String group, boolean filterable, boolean comparable,
                                        boolean required, boolean highlight, int sort, List<AdminBucketDto> buckets,
                                        String hint, List<AdminOptionDto> options,
                                        /** Defined on an ancestor (or global) of the requested category. */
                                        boolean inherited,
                                        /** Products that have a value for it. */
                                        long usedCount) {
    }

    public record BucketInput(Double min, Double max, @Size(max = 96) String labelRu, @Size(max = 96) String labelUk,
                              @Size(max = 96) String labelEn) {
    }

    public record OptionInput(@Size(max = 64) String value, @Size(max = 96) String labelRu,
                              @Size(max = 96) String labelUk, @Size(max = 96) String labelEn,
                              List<@Size(max = 128) String> aliases, Integer sort) {
    }

    public record RenameOption(@NotBlank String from, @NotBlank String to) {
    }

    /**
     * Create / edit an attribute. {@code null} = keep. {@code options} (enum/multi) replaces the list;
     * removing an option that products use needs {@code force}. {@code renameOptions} are applied
     * first and rewrite the products' specs.
     */
    public record SpecAttributeUpsertRequest(
            String categoryId,
            @Size(max = 48) String key,
            @Size(max = 96) String labelRu,
            @Size(max = 96) String labelUk,
            @Size(max = 96) String labelEn,
            String type,
            @Size(max = 24) String unitRu,
            @Size(max = 24) String unitUk,
            @Size(max = 24) String unitEn,
            Boolean range,
            @Size(max = 32) String group,
            Boolean filterable,
            Boolean comparable,
            Boolean required,
            Boolean highlight,
            Integer sort,
            @Valid @Size(max = 30) List<BucketInput> buckets,
            String hint,
            @Valid @Size(max = 500) List<OptionInput> options,
            @Valid @Size(max = 100) List<RenameOption> renameOptions) {
    }

    public record AdminSpecGroupDto(@NotBlank @Size(max = 32) String key, @Size(max = 64) String labelRu,
                                    @Size(max = 64) String labelUk, @Size(max = 64) String labelEn, Integer sort) {
    }

    // ------------------------------------------------------------------ admin: cards

    /**
     * {@code unfinished} = products created in the admin and never published (V53 flag), not archived;
     * {@code incomplete} = active products with a required characteristic missing or no category.
     */
    public record CardsStats(long draft, long aiFilled, long ready, long incomplete, long unfinished) {
    }

    public record CardExportItem(String id, String title, String slug, String categoryId, String categorySlug,
                                 String brand, String condition, String conditionNote, String description,
                                 Map<String, Object> specs, String cardStatus, Integer cardConfidence,
                                 Map<String, Object> cardMeta, List<String> missingRequired, List<String> variants,
                                 String imageUrl, long priceMinor, long price, boolean active, int stock,
                                 boolean unfinished) {
    }

    /** Translations of one language in a cards import item (all optional). */
    public record CardTranslation(String title, String description, String conditionNote) {
    }

    public record CardImportItem(String productId, String categorySlug, String brand, Map<String, Object> specs,
                                 Map<String, Object> confidence, Integer overall, String description,
                                 List<String> sources, String notes, String model, Boolean markReady,
                                 /** Optional extras (not in the AI answer format): state of the product. */
                                 String condition, String conditionNote,
                                 /** Proposed Russian title (rename). */
                                 String title,
                                 /** {@code uk} / {@code en} → texts of the resulting Russian source. */
                                 Map<String, CardTranslation> translations,
                                 /** Make it active afterwards when publishable (price, category). */
                                 Boolean publish,
                                 /** Optional source url per characteristic key (written as {@code src}). */
                                 Map<String, String> fieldSources) {
    }

    /**
     * «Принять» in the review panel: the admin's inline edits (all optional) — they are written as
     * the admin's (translations MANUAL) and merged into {@code card_meta.last} as edited.
     */
    public record CardAcceptRequest(String title, String description, Map<String, Object> specs,
                                    Map<String, CardTranslation> translations, Boolean ready) {
    }

    /** One current uk/en text of the product: origin AI | MANUAL; stale = made for another Russian text. */
    public record CardTextState(String text, String origin, boolean stale) {
    }

    /**
     * Review panel data: the card, the snapshot of the last AI import ({@code last}: what changed,
     * before → after), who reviewed it (name) and the current uk/en texts.
     */
    public record CardReview(CardExportItem item, Map<String, Object> last, String importedAt, String reviewedAt,
                             Long reviewedBy, String reviewedByName,
                             Map<String, Map<String, CardTextState>> translations) {
    }

    public record CardsImportRequest(List<CardImportItem> items, Boolean replaceSpecs) {
    }

    public record CardRejected(String productId, String reason) {
    }

    public record CardIssue(String productId, String key, String reason, String message) {
    }

    /** Per product: applied, published (+ reason when not), translations written per language. */
    public record CardItemResult(String productId, boolean applied, boolean published, String reason,
                                 Map<String, Integer> translated, int skippedManual) {
    }

    public record CardsImportResult(int applied, List<CardRejected> rejected, List<CardIssue> issues,
                                    List<String> createdBrands, List<CardItemResult> items) {
    }

    public record CardStatusRequest(String status) {
    }
}
