package com.maxsolch.shop.catalog.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.maxsolch.shop.catalog.app.CatalogDtos.AdminBrandDto;
import com.maxsolch.shop.catalog.app.CatalogDtos.AdminCategoryDto;
import com.maxsolch.shop.catalog.app.CatalogDtos.AdminSpecAttributeDto;
import com.maxsolch.shop.catalog.app.CatalogDtos.AdminSpecGroupDto;
import com.maxsolch.shop.catalog.app.CatalogDtos.BrandUpsertRequest;
import com.maxsolch.shop.catalog.app.CatalogDtos.CategoryUpsertRequest;
import com.maxsolch.shop.catalog.app.CatalogDtos.RenameOption;
import com.maxsolch.shop.catalog.app.CatalogDtos.ReorderItem;
import com.maxsolch.shop.catalog.app.CatalogDtos.SpecAttributeUpsertRequest;
import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.site.app.SiteRevalidator;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * What the admin does with the catalog structure — categories, brands, characteristics, groups and the schema import,
 * one method per button: runs the editing service, journals the change and rebuilds the site (a schema, category or
 * brand change can show on any page, hence {@code allChanged}). Not {@code @Transactional}: audit entries are
 * written on their own, after the editing transaction has committed.
 */
@Service
public class AdminCatalog {

    private final CategoryAdminService categories;
    private final BrandAdminService brands;
    private final SpecAttributeAdminService attributes;
    private final SpecGroupAdminService groups;
    private final CatalogSchemaImporter importer;
    private final AdminAuditService audit;
    private final SiteRevalidator siteRevalidator;
    private final AdminAccess adminAccess;
    private final CurrentActor actor;

    public AdminCatalog(CategoryAdminService categories, BrandAdminService brands,
                        SpecAttributeAdminService attributes, SpecGroupAdminService groups,
                        CatalogSchemaImporter importer, AdminAuditService audit, SiteRevalidator siteRevalidator,
                        AdminAccess adminAccess, CurrentActor actor) {
        this.categories = categories;
        this.brands = brands;
        this.attributes = attributes;
        this.groups = groups;
        this.importer = importer;
        this.audit = audit;
        this.siteRevalidator = siteRevalidator;
        this.adminAccess = adminAccess;
        this.actor = actor;
    }

    // ------------------------------------------------------------------ categories

    public AdminCategoryDto createCategory(CategoryUpsertRequest req) {
        CategoryAdminService.Saved s = categories.create(req);
        audit.record("CATEGORY_CREATE", "CATEGORY", s.category().id(), s.category().name() + ", slug "
                + s.category().slug());
        siteRevalidator.allChanged();
        return s.category();
    }

    public List<AdminCategoryDto> reorderCategories(List<ReorderItem> items) {
        List<AdminCategoryDto> out = categories.reorder(items);
        audit.record("CATEGORY_REORDER", "CATEGORY", null, "категорий: " + items.size());
        siteRevalidator.allChanged();
        return out;
    }

    public AdminCategoryDto updateCategory(String id, CategoryUpsertRequest req) {
        CategoryAdminService.Saved s = categories.update(id, req);
        AdminCategoryDto c = s.category();
        audit.record("CATEGORY_UPDATE", "CATEGORY", id, c.name() + ", slug " + c.slug() + ", order "
                + c.sortOrder() + (c.showInMenu() ? "" : ", скрыта из меню")
                + (s.seoChanged().isEmpty() ? "" : ", изменено: " + String.join(", ", s.seoChanged())));
        siteRevalidator.allChanged();
        return c;
    }

    public void deleteCategory(String id) {
        CategoryAdminService.Deleted d = categories.delete(id);
        audit.record("CATEGORY_DELETE", "CATEGORY", id, d.name() + ", slug " + d.slug());
        siteRevalidator.allChanged();
    }

    // ------------------------------------------------------------------ brands

    public AdminBrandDto createBrand(BrandUpsertRequest req) {
        AdminBrandDto b = brands.create(req);
        audit.record("BRAND_CREATE", "BRAND", b.id(), b.name());
        siteRevalidator.allChanged();
        return b;
    }

    public AdminBrandDto updateBrand(String id, BrandUpsertRequest req) {
        AdminBrandDto b = brands.update(id, req);
        audit.record("BRAND_UPDATE", "BRAND", id, b.name() + ", slug " + b.slug()
                + (req.logoUrl() == null ? "" : req.logoUrl().isBlank() ? ", логотип удалён" : ", логотип")
                + (req.logoMode() == null ? "" : ", режим логотипа " + b.logoMode()));
        siteRevalidator.allChanged();
        return b;
    }

    public void deleteBrand(String id) {
        String name = brands.delete(id);
        audit.record("BRAND_DELETE", "BRAND", id, name);
        siteRevalidator.allChanged();
    }

    public AdminBrandDto mergeBrand(String id, String targetId) {
        AdminBrandDto b = brands.merge(id, targetId);
        audit.record("BRAND_MERGE", "BRAND", targetId, "объединён в «" + b.name() + "» (" + id + ")");
        siteRevalidator.allChanged();
        return b;
    }

    // ------------------------------------------------------------------ characteristics and groups

    public AdminSpecAttributeDto createAttribute(SpecAttributeUpsertRequest req) {
        AdminSpecAttributeDto a = attributes.create(req);
        audit.record("SPEC_ATTRIBUTE_CREATE", "SPEC_ATTRIBUTE", a.id(), a.key() + " «" + a.labelRu() + "»");
        siteRevalidator.allChanged();
        return a;
    }

    public AdminSpecAttributeDto updateAttribute(String id, SpecAttributeUpsertRequest req, boolean force) {
        AdminSpecAttributeDto a = attributes.update(id, req, force);
        audit.record("SPEC_ATTRIBUTE_UPDATE", "SPEC_ATTRIBUTE", id, a.key() + " «" + a.labelRu() + "»"
                + (force ? ", принудительно" : ""));
        siteRevalidator.allChanged();
        return a;
    }

    public AdminSpecAttributeDto renameOption(String id, RenameOption body) {
        AdminSpecAttributeDto a = attributes.renameOption(id, body.from(), body.to());
        audit.record("SPEC_ATTRIBUTE_UPDATE", "SPEC_ATTRIBUTE", id, a.key() + ": опция " + body.from() + " → "
                + body.to());
        siteRevalidator.allChanged();
        return a;
    }

    /**
     * {@code force} erases the stored values of the characteristic from the products, so it is for the main admin only.
     * The rule depends on the request parameter, which a method annotation cannot see: it is checked here, before
     * anything is touched, and answers 403 with the same text the controller used to give.
     */
    public void deleteAttribute(String id, boolean force) {
        if (force) {
            adminAccess.requireSuperAdmin(actor.userId(), "Принудительное удаление характеристики");
        }
        String key = attributes.delete(id, force);
        audit.record("SPEC_ATTRIBUTE_DELETE", "SPEC_ATTRIBUTE", id, key + (force ? ", принудительно" : ""));
        siteRevalidator.allChanged();
    }

    public List<AdminSpecGroupDto> putGroups(List<AdminSpecGroupDto> input) {
        List<AdminSpecGroupDto> out = groups.putGroups(input);
        audit.record("SPEC_GROUPS_UPDATE", "SPEC_GROUP", null, "групп: " + out.size());
        siteRevalidator.allChanged();
        return out;
    }

    // ------------------------------------------------------------------ schema

    public CatalogSchemaImporter.Result importSchema(JsonNode body) {
        CatalogSchemaImporter.Result r = importer.importSchema(body, actorId());
        audit.record("CATALOG_SCHEMA_IMPORT", "CATALOG", null, "категорий +" + r.categoriesCreated() + " ~"
                + r.categoriesUpdated() + ", характеристик +" + r.attributesCreated() + " ~" + r.attributesUpdated()
                + ", опций +" + r.optionsCreated() + ", перенесено товаров " + r.productsMoved());
        siteRevalidator.allChanged();
        return r;
    }

    private Long actorId() {
        return actor.isPresent() ? actor.userId() : null;
    }
}
