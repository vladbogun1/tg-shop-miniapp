package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.service.TagAdminService;
import com.maxsolch.shop.site.SiteRevalidator;
import com.maxsolch.shop.web.dto.AdminTagDto;
import com.maxsolch.shop.web.dto.TagUpsertRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Tags = the site's categories (logic and caching in {@link TagAdminService}). The controller only
 * journals and rebuilds the site — both after the change has committed, so neither records nor
 * publishes something that was then rolled back.
 */
@RestController
@RequestMapping("/api/admin/tags")
@RequiredAdmin
@io.swagger.v3.oas.annotations.tags.Tag(name = "Admin Tags", description = "Admin tag management")
@SecurityRequirement(name = "bearer-jwt")
public class AdminTagController {

    private final TagAdminService tagAdminService;
    private final AdminAuditService audit;
    private final SiteRevalidator siteRevalidator;

    public AdminTagController(TagAdminService tagAdminService, AdminAuditService audit,
                              SiteRevalidator siteRevalidator) {
        this.tagAdminService = tagAdminService;
        this.audit = audit;
        this.siteRevalidator = siteRevalidator;
    }

    @GetMapping
    @Operation(summary = "List tags")
    public List<AdminTagDto> list() {
        return tagAdminService.list();
    }

    @PostMapping
    @Operation(summary = "Create tag")
    public AdminTagDto create(@Valid @RequestBody TagUpsertRequest req) {
        AdminTagDto saved = tagAdminService.create(req).tag();
        audit.record("TAG_CREATE", "TAG", saved.id(), saved.name());
        siteRevalidator.categoryChanged(saved.slug(), null);
        return saved;
    }

    @PatchMapping("/{id}")
    @Operation(summary = "Edit tag (name, slug, menu order, menu visibility, SEO of the category page)")
    public AdminTagDto update(@PathVariable String id, @Valid @RequestBody TagUpsertRequest req) {
        TagAdminService.Saved result = tagAdminService.update(id, req);
        AdminTagDto saved = result.tag();
        audit.record("TAG_UPDATE", "TAG", id,
                saved.name() + ", slug " + saved.slug() + ", order " + saved.sortOrder()
                        + (saved.showInMenu() ? "" : ", скрыт из меню") + seoNote(result.seoChanged()));
        siteRevalidator.categoryChanged(saved.slug(), result.previousSlug());
        return saved;
    }

    /** Journal note: which SEO fields changed (the texts themselves are too long to log). */
    private static String seoNote(List<String> changed) {
        return changed == null || changed.isEmpty() ? "" : ", изменено: " + String.join(", ", changed);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete tag")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        TagAdminService.Deleted deleted = tagAdminService.delete(id);
        audit.record("TAG_DELETE", "TAG", id, deleted.name());
        siteRevalidator.categoryChanged(deleted.slug(), null);
        return ResponseEntity.noContent().build();
    }
}
