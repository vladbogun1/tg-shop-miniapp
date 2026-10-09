package com.maxsolch.shop.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.catalog.CatalogDtos.AdminBrandDto;
import com.maxsolch.shop.catalog.CatalogDtos.AdminCategoryDto;
import com.maxsolch.shop.catalog.CatalogDtos.AdminSpecAttributeDto;
import com.maxsolch.shop.catalog.CatalogDtos.AdminSpecGroupDto;
import com.maxsolch.shop.catalog.CatalogDtos.BrandUpsertRequest;
import com.maxsolch.shop.catalog.CatalogDtos.CardExportItem;
import com.maxsolch.shop.catalog.CatalogDtos.CardStatusRequest;
import com.maxsolch.shop.catalog.CatalogDtos.CardsImportRequest;
import com.maxsolch.shop.catalog.CatalogDtos.CardsImportResult;
import com.maxsolch.shop.catalog.CatalogDtos.CardsStats;
import com.maxsolch.shop.catalog.CatalogDtos.CategoryUpsertRequest;
import com.maxsolch.shop.catalog.CatalogDtos.RenameOption;
import com.maxsolch.shop.catalog.CatalogDtos.ReorderItem;
import com.maxsolch.shop.catalog.CatalogDtos.SpecAttributeUpsertRequest;
import com.maxsolch.shop.media.ImageStorageService;
import com.maxsolch.shop.media.UploadValidator;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.service.AdminProductService;
import com.maxsolch.shop.site.SiteRevalidator;
import com.maxsolch.shop.web.SecurityUtil;
import com.maxsolch.shop.web.dto.AdminProductDto;
import com.maxsolch.shop.web.dto.UploadResponse;
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
    private final CatalogSchemaService schema;
    private final CatalogSchemaImporter importer;
    private final CardsService cards;
    private final AdminProductService products;
    private final AdminAuditService audit;
    private final SiteRevalidator siteRevalidator;
    private final UploadValidator uploadValidator;
    private final ImageStorageService imageStorageService;

    public AdminCatalogController(CategoryAdminService categories, BrandAdminService brands,
                                  SpecAttributeAdminService attributes, CatalogSchemaService schema,
                                  CatalogSchemaImporter importer, CardsService cards, AdminProductService products,
                                  AdminAuditService audit, SiteRevalidator siteRevalidator,
                                  UploadValidator uploadValidator, ImageStorageService imageStorageService) {
        this.categories = categories;
        this.brands = brands;
        this.attributes = attributes;
        this.schema = schema;
        this.importer = importer;
        this.cards = cards;
        this.products = products;
        this.audit = audit;
        this.siteRevalidator = siteRevalidator;
        this.uploadValidator = uploadValidator;
        this.imageStorageService = imageStorageService;
    }

    private static Long adminId() {
        try {
            return SecurityUtil.currentUserId();
        } catch (RuntimeException e) {
            return null;
        }
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
        CategoryAdminService.Saved s = categories.create(req);
        audit.record("CATEGORY_CREATE", "CATEGORY", s.category().id(), s.category().name() + ", slug "
                + s.category().slug());
        siteRevalidator.allChanged();
        return s.category();
    }

    @PatchMapping("/categories/reorder")
    @Operation(summary = "Move/reorder categories: [{id, parentId, sortOrder}]")
    public List<AdminCategoryDto> reorder(@Valid @RequestBody List<ReorderItem> items) {
        List<AdminCategoryDto> out = categories.reorder(items);
        audit.record("CATEGORY_REORDER", "CATEGORY", null, "категорий: " + items.size());
        siteRevalidator.allChanged();
        return out;
    }

    @PatchMapping("/categories/{id}")
    @Operation(summary = "Edit category (null = keep; parentId \"\" = make root)")
    public AdminCategoryDto updateCategory(@PathVariable String id, @Valid @RequestBody CategoryUpsertRequest req) {
        CategoryAdminService.Saved s = categories.update(id, req);
        AdminCategoryDto c = s.category();
        audit.record("CATEGORY_UPDATE", "CATEGORY", id, c.name() + ", slug " + c.slug() + ", order "
                + c.sortOrder() + (c.showInMenu() ? "" : ", скрыта из меню")
                + (s.seoChanged().isEmpty() ? "" : ", изменено: " + String.join(", ", s.seoChanged())));
        siteRevalidator.allChanged();
        return c;
    }

    @DeleteMapping("/categories/{id}")
    @Operation(summary = "Delete category (409 CATEGORY_HAS_PRODUCTS / CATEGORY_HAS_CHILDREN)")
    public ResponseEntity<Void> deleteCategory(@PathVariable String id) {
        CategoryAdminService.Deleted d = categories.delete(id);
        audit.record("CATEGORY_DELETE", "CATEGORY", id, d.name() + ", slug " + d.slug());
        siteRevalidator.allChanged();
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
        AdminBrandDto b = brands.create(req);
        audit.record("BRAND_CREATE", "BRAND", b.id(), b.name());
        siteRevalidator.allChanged();
        return b;
    }

    @PostMapping("/brands/uploads")
    @Operation(summary = "Upload a brand logo: SVG/PNG/WebP (returns S3 key for logoUrl)")
    public UploadResponse uploadBrandLogo(@RequestParam("file") MultipartFile file) {
        uploadValidator.validateBrandLogo(file);
        return UploadResponse.ofKey(imageStorageService.uploadBrandLogo(file));
    }

    @PatchMapping("/brands/{id}")
    public AdminBrandDto updateBrand(@PathVariable String id, @Valid @RequestBody BrandUpsertRequest req) {
        AdminBrandDto b = brands.update(id, req);
        audit.record("BRAND_UPDATE", "BRAND", id, b.name() + ", slug " + b.slug()
                + (req.logoUrl() == null ? "" : req.logoUrl().isBlank() ? ", логотип удалён" : ", логотип")
                + (req.logoMode() == null ? "" : ", режим логотипа " + b.logoMode()));
        siteRevalidator.allChanged();
        return b;
    }

    @DeleteMapping("/brands/{id}")
    @Operation(summary = "Delete brand (its products keep existing without a brand)")
    public ResponseEntity<Void> deleteBrand(@PathVariable String id) {
        String name = brands.delete(id);
        audit.record("BRAND_DELETE", "BRAND", id, name);
        siteRevalidator.allChanged();
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/brands/{id}/merge-into/{targetId}")
    @Operation(summary = "Merge a brand into another (products move, the name becomes an alias)")
    public AdminBrandDto mergeBrand(@PathVariable String id, @PathVariable String targetId) {
        AdminBrandDto b = brands.merge(id, targetId);
        audit.record("BRAND_MERGE", "BRAND", targetId, "объединён в «" + b.name() + "» (" + id + ")");
        siteRevalidator.allChanged();
        return b;
    }

    // ------------------------------------------------------------------ attributes / groups

    @GetMapping("/spec-attributes")
    @Operation(summary = "Attributes of a category (own + inherited, flagged) or the global ones")
    public List<AdminSpecAttributeDto> attributes(@RequestParam(required = false) String categoryId) {
        return attributes.list(categoryId);
    }

    @PostMapping("/spec-attributes")
    public AdminSpecAttributeDto createAttribute(@Valid @RequestBody SpecAttributeUpsertRequest req) {
        AdminSpecAttributeDto a = attributes.create(req);
        audit.record("SPEC_ATTRIBUTE_CREATE", "SPEC_ATTRIBUTE", a.id(), a.key() + " «" + a.labelRu() + "»");
        siteRevalidator.allChanged();
        return a;
    }

    @PatchMapping("/spec-attributes/{id}")
    @Operation(summary = "Edit attribute; options replace the list (removing a used one needs force=1)")
    public AdminSpecAttributeDto updateAttribute(@PathVariable String id,
                                                 @Valid @RequestBody SpecAttributeUpsertRequest req,
                                                 @RequestParam(required = false) String force) {
        AdminSpecAttributeDto a = attributes.update(id, req, flag(force));
        audit.record("SPEC_ATTRIBUTE_UPDATE", "SPEC_ATTRIBUTE", id, a.key() + " «" + a.labelRu() + "»"
                + (flag(force) ? ", принудительно" : ""));
        siteRevalidator.allChanged();
        return a;
    }

    @PostMapping("/spec-attributes/{id}/rename-option")
    @Operation(summary = "Rename (or merge) an option value and rewrite the products' specs")
    public AdminSpecAttributeDto renameOption(@PathVariable String id, @Valid @RequestBody RenameOption body) {
        AdminSpecAttributeDto a = attributes.renameOption(id, body.from(), body.to());
        audit.record("SPEC_ATTRIBUTE_UPDATE", "SPEC_ATTRIBUTE", id, a.key() + ": опция " + body.from() + " → "
                + body.to());
        siteRevalidator.allChanged();
        return a;
    }

    @DeleteMapping("/spec-attributes/{id}")
    @Operation(summary = "Delete attribute (409 ATTRIBUTE_IN_USE {count} unless force=1)")
    public ResponseEntity<Void> deleteAttribute(@PathVariable String id,
                                                @RequestParam(required = false) String force) {
        String key = attributes.delete(id, flag(force));
        audit.record("SPEC_ATTRIBUTE_DELETE", "SPEC_ATTRIBUTE", id, key + (flag(force) ? ", принудительно" : ""));
        siteRevalidator.allChanged();
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/spec-groups")
    public List<AdminSpecGroupDto> groups() {
        return attributes.groups();
    }

    @PutMapping("/spec-groups")
    @Operation(summary = "Replace the list of groups (409 GROUP_IN_USE when removing a used one)")
    public List<AdminSpecGroupDto> putGroups(@Valid @RequestBody List<AdminSpecGroupDto> groups) {
        List<AdminSpecGroupDto> out = attributes.putGroups(groups);
        audit.record("SPEC_GROUPS_UPDATE", "SPEC_GROUP", null, "групп: " + out.size());
        siteRevalidator.allChanged();
        return out;
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
        CatalogSchemaImporter.Result r = importer.importSchema(body, adminId());
        audit.record("CATALOG_SCHEMA_IMPORT", "CATALOG", null, "категорий +" + r.categoriesCreated() + " ~"
                + r.categoriesUpdated() + ", характеристик +" + r.attributesCreated() + " ~" + r.attributesUpdated()
                + ", опций +" + r.optionsCreated() + ", перенесено товаров " + r.productsMoved());
        siteRevalidator.allChanged();
        return r;
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
        CardsImportResult r = cards.importCards(body, adminId());
        long published = r.items().stream().filter(i -> i.published()).count();
        audit.record("CARDS_IMPORT", "PRODUCT", null, "применено " + r.applied() + ", отклонено "
                + r.rejected().size() + ", замечаний " + r.issues().size()
                + (r.createdBrands().isEmpty() ? "" : ", новые бренды: " + String.join(", ", r.createdBrands()))
                + ", на витрине " + published);
        siteRevalidator.allChanged();
        return r;
    }

    @PatchMapping("/products/{id}/card-status")
    @Operation(summary = "Card status DRAFT | AI_FILLED | READY («Проверено»)")
    public AdminProductDto cardStatus(@PathVariable String id, @RequestBody CardStatusRequest body) {
        AdminProductDto p = products.setCardStatus(id, body == null ? null : body.status(), adminId());
        audit.record("PRODUCT_CARD_STATUS", "PRODUCT", id, p.title() + ": " + p.cardStatus());
        return p;
    }

    static boolean flag(String v) {
        return v != null && (v.equals("1") || v.equalsIgnoreCase("true") || v.equalsIgnoreCase("yes"));
    }
}
