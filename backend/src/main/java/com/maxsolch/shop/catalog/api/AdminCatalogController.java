package com.maxsolch.shop.catalog.api;

import com.maxsolch.shop.catalog.app.BrandAdminService;
import com.maxsolch.shop.catalog.app.AdminCards;
import com.maxsolch.shop.catalog.app.AdminCatalog;
import com.maxsolch.shop.catalog.app.CardsService;
import com.maxsolch.shop.catalog.app.SpecGroupAdminService;
import com.maxsolch.shop.catalog.app.CatalogDtos;
import com.maxsolch.shop.catalog.app.CatalogSchemaImporter;
import com.maxsolch.shop.catalog.app.CatalogSchemaService;
import com.maxsolch.shop.catalog.app.CategoryAdminService;
import com.maxsolch.shop.catalog.app.SpecAttributeAdminService;
import com.fasterxml.jackson.databind.JsonNode;
import com.maxsolch.shop.catalog.app.CatalogDtos.AdminBrandDto;
import com.maxsolch.shop.catalog.app.CatalogDtos.AdminCategoryDto;
import com.maxsolch.shop.catalog.app.CatalogDtos.AdminSpecAttributeDto;
import com.maxsolch.shop.catalog.app.CatalogDtos.AdminSpecGroupDto;
import com.maxsolch.shop.catalog.app.CatalogDtos.BrandUpsertRequest;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardExportItem;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardStatusRequest;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardsImportRequest;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardsImportResult;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardsStats;
import com.maxsolch.shop.catalog.app.CatalogDtos.CategoryUpsertRequest;
import com.maxsolch.shop.catalog.app.CatalogDtos.RenameOption;
import com.maxsolch.shop.catalog.app.CatalogDtos.ReorderItem;
import com.maxsolch.shop.catalog.app.CatalogDtos.SpecAttributeUpsertRequest;
import com.maxsolch.shop.media.app.ImageStorageService;
import com.maxsolch.shop.media.app.UploadValidator;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.catalog.app.AdminProductDto;
import com.maxsolch.shop.media.app.UploadResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/**
 * Admin API of catalog v2 (docs/CATALOG-SPECS.md §3.2–3.4): categories, brands, characteristics,
 * the schema import/export and the AI cards queue. Every change is journaled and rebuilds the site
 * (schema/category/brand changes can show on any page → {@code allChanged}).
 */
@RestController
@RequestMapping("/api/admin")
@RequiredAdmin
@Tag(name = "Admin Catalog", description = "Categories, brands, characteristics, schema, cards")
@SecurityRequirement(name = "bearer-jwt")
public class AdminCatalogController {

    private final CategoryAdminService categories;
    private final BrandAdminService brands;
    private final SpecAttributeAdminService attributes;
    private final SpecGroupAdminService groups;
    private final CatalogSchemaService schema;
    private final CardsService cards;
    private final AdminCatalog catalog;
    private final AdminCards adminCards;
    private final UploadValidator uploadValidator;
    private final ImageStorageService imageStorageService;

    public AdminCatalogController(CategoryAdminService categories, BrandAdminService brands,
                                  SpecAttributeAdminService attributes, SpecGroupAdminService groups,
                                  CatalogSchemaService schema, CardsService cards, AdminCatalog catalog,
                                  AdminCards adminCards, UploadValidator uploadValidator,
                                  ImageStorageService imageStorageService) {
        this.categories = categories;
        this.brands = brands;
        this.attributes = attributes;
        this.groups = groups;
        this.schema = schema;
        this.cards = cards;
        this.catalog = catalog;
        this.adminCards = adminCards;
        this.uploadValidator = uploadValidator;
        this.imageStorageService = imageStorageService;
    }

    // ------------------------------------------------------------------ categories

    @GetMapping("/categories")
    @Operation(summary = "Category tree as a flat list (tree order) with counts and SEO")
    public List<AdminCategoryDto> categories() {
        return categories.list();
    }

    @PostMapping("/categories")
    @Operation(summary = "Create category (parentId null = root; depth ≤ 2)")
    public AdminCategoryDto createCategory(@Valid @RequestBody CategoryUpsertRequest req) {
        return catalog.createCategory(req);
    }

    @PatchMapping("/categories/reorder")
    @Operation(summary = "Move/reorder categories: [{id, parentId, sortOrder}]")
    public List<AdminCategoryDto> reorder(@Valid @RequestBody List<ReorderItem> items) {
        return catalog.reorderCategories(items);
    }

    @PatchMapping("/categories/{id}")
    @Operation(summary = "Edit category (null = keep; parentId \"\" = make root)")
    public AdminCategoryDto updateCategory(@PathVariable String id, @Valid @RequestBody CategoryUpsertRequest req) {
        return catalog.updateCategory(id, req);
    }

    @DeleteMapping("/categories/{id}")
    @Operation(summary = "Delete category (409 CATEGORY_HAS_PRODUCTS / CATEGORY_HAS_CHILDREN)")
    public ResponseEntity<Void> deleteCategory(@PathVariable String id) {
        catalog.deleteCategory(id);
        return ResponseEntity.noContent().build();
    }

    // ------------------------------------------------------------------ brands

    @GetMapping("/brands")
    @Operation(summary = "Brands with product counts")
    public List<AdminBrandDto> brands() {
        return brands.list();
    }

    @PostMapping("/brands")
    public AdminBrandDto createBrand(@Valid @RequestBody BrandUpsertRequest req) {
        return catalog.createBrand(req);
    }

    @PostMapping("/brands/uploads")
    @Operation(summary = "Upload a brand logo: SVG/PNG/WebP (returns S3 key for logoUrl)")
    public UploadResponse uploadBrandLogo(@RequestParam("file") MultipartFile file) {
        uploadValidator.validateBrandLogo(file);
        return UploadResponse.ofKey(imageStorageService.uploadBrandLogo(file));
    }

    @PatchMapping("/brands/{id}")
    public AdminBrandDto updateBrand(@PathVariable String id, @Valid @RequestBody BrandUpsertRequest req) {
        return catalog.updateBrand(id, req);
    }

    @DeleteMapping("/brands/{id}")
    @Operation(summary = "Delete brand (its products keep existing without a brand)")
    public ResponseEntity<Void> deleteBrand(@PathVariable String id) {
        catalog.deleteBrand(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/brands/{id}/merge-into/{targetId}")
    @Operation(summary = "Merge a brand into another (products move, the name becomes an alias)")
    public AdminBrandDto mergeBrand(@PathVariable String id, @PathVariable String targetId) {
        return catalog.mergeBrand(id, targetId);
    }

    // ------------------------------------------------------------------ attributes / groups

    @GetMapping("/spec-attributes")
    @Operation(summary = "Attributes of a category (own + inherited, flagged) or the global ones")
    public List<AdminSpecAttributeDto> attributes(@RequestParam(required = false) String categoryId) {
        return attributes.list(categoryId);
    }

    @PostMapping("/spec-attributes")
    public AdminSpecAttributeDto createAttribute(@Valid @RequestBody SpecAttributeUpsertRequest req) {
        return catalog.createAttribute(req);
    }

    @PatchMapping("/spec-attributes/{id}")
    @Operation(summary = "Edit attribute; options replace the list (removing a used one needs force=1)")
    public AdminSpecAttributeDto updateAttribute(@PathVariable String id,
                                                 @Valid @RequestBody SpecAttributeUpsertRequest req,
                                                 @RequestParam(required = false) String force) {
        return catalog.updateAttribute(id, req, flag(force));
    }

    @PostMapping("/spec-attributes/{id}/rename-option")
    @Operation(summary = "Rename (or merge) an option value and rewrite the products' specs")
    public AdminSpecAttributeDto renameOption(@PathVariable String id, @Valid @RequestBody RenameOption body) {
        return catalog.renameOption(id, body);
    }

    @DeleteMapping("/spec-attributes/{id}")
    @Operation(summary = "Delete attribute (409 ATTRIBUTE_IN_USE {count} unless force=1; force=1 — main admin only)")
    public ResponseEntity<Void> deleteAttribute(@PathVariable String id,
                                                @RequestParam(required = false) String force) {
        catalog.deleteAttribute(id, flag(force));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/spec-groups")
    public List<AdminSpecGroupDto> groups() {
        return groups.groups();
    }

    @PutMapping("/spec-groups")
    @Operation(summary = "Replace the list of groups (409 GROUP_IN_USE when removing a used one)")
    public List<AdminSpecGroupDto> putGroups(@Valid @RequestBody List<AdminSpecGroupDto> input) {
        return catalog.putGroups(input);
    }

    // ------------------------------------------------------------------ schema

    @GetMapping("/catalog/schema")
    @Operation(summary = "Whole schema in all languages (the import format, with ids)")
    public Map<String, Object> schema() {
        return schema.adminSchema();
    }

    @PutMapping("/catalog/schema")
    @Operation(summary = "Import a whole schema (schema-draft.json format; upsert, never deletes; "
            + "optional product_moves [{from_category_slug, to_category_slug}])")
    public CatalogSchemaImporter.Result importSchema(@RequestBody JsonNode body) {
        return catalog.importSchema(body);
    }

    // ------------------------------------------------------------------ cards

    @GetMapping("/cards/stats")
    public CardsStats cardsStats() {
        return cards.stats();
    }

    @GetMapping("/cards/export")
    @Operation(summary = "Products for the AI prompt: status=draft|ai_filled|ready|incomplete|unfinished|all, ids=")
    public List<CardExportItem> cardsExport(@RequestParam(required = false) String status,
                                            @RequestParam(required = false) String ids) {
        return cards.export(status, ids);
    }

    @PutMapping("/cards/import")
    @Operation(summary = "Apply an AI answer: specs/brand/category/description/title/translations, publish")
    public CardsImportResult cardsImport(@RequestBody CardsImportRequest body) {
        return adminCards.importCards(body);
    }

    @GetMapping("/cards/{productId}/review")
    @Operation(summary = "Review panel: the card, what the last AI import changed (before → after), "
            + "who reviewed it, current uk/en texts")
    public CatalogDtos.CardReview cardReview(@PathVariable String productId) {
        return cards.review(productId);
    }

    @PutMapping("/cards/{productId}/accept")
    @Operation(summary = "«Принять»: the admin's edits (title/description/specs/uk·en) + READY")
    public CardsImportResult cardAccept(@PathVariable String productId,
                                        @RequestBody(required = false) CatalogDtos.CardAcceptRequest body) {
        return adminCards.accept(productId, body);
    }

    @PatchMapping("/products/{id}/card-status")
    @Operation(summary = "Card status DRAFT | AI_FILLED | READY («Проверено»)")
    public AdminProductDto cardStatus(@PathVariable String id, @RequestBody CardStatusRequest body) {
        return adminCards.setCardStatus(id, body == null ? null : body.status());
    }

    static boolean flag(String v) {
        return v != null && (v.equals("1") || v.equalsIgnoreCase("true") || v.equalsIgnoreCase("yes"));
    }
}
