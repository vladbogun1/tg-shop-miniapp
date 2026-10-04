package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.site.SiteRevalidator;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.translation.TranslationAdminService;
import com.maxsolch.shop.translation.TranslationDtos.DeleteResult;
import com.maxsolch.shop.translation.TranslationDtos.ExportItem;
import com.maxsolch.shop.translation.TranslationDtos.ImportRequest;
import com.maxsolch.shop.translation.TranslationDtos.ImportResult;
import com.maxsolch.shop.translation.TranslationDtos.SourceFixRequest;
import com.maxsolch.shop.translation.TranslationDtos.SourceFixResult;
import com.maxsolch.shop.translation.TranslationDtos.SourceRef;
import com.maxsolch.shop.translation.TranslationDtos.Stats;
import com.maxsolch.shop.web.SecurityUtil;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Content translations (docs/CONTENT-I18N.md): export of Russian sources with their hashes, import
 * of translated texts, stats, targeted reset. The base for the future translation screen.
 */
@RestController
@RequestMapping("/api/admin/translations")
@RequiredAdmin
@Tag(name = "Admin Translations", description = "Content translations (uk/en) over the Russian source")
@SecurityRequirement(name = "bearer-jwt")
public class AdminTranslationController {

    private final TranslationAdminService service;
    private final AdminAuditService audit;
    private final SiteRevalidator siteRevalidator;

    public AdminTranslationController(TranslationAdminService service, AdminAuditService audit,
                                      SiteRevalidator siteRevalidator) {
        this.service = service;
        this.audit = audit;
        this.siteRevalidator = siteRevalidator;
    }

    @GetMapping("/export")
    @Operation(summary = "Translatable fields with source, sourceHash and status. status: missing|stale|translated|all")
    public List<ExportItem> export(@RequestParam String locale,
                                   @RequestParam(required = false, defaultValue = "all") String status,
                                   @RequestParam(required = false) String entityType) {
        return service.export(locale, status, entityType);
    }

    @PutMapping("/import")
    @Operation(summary = "Import translations; applied only when sourceHash matches the current source, "
            + "MANUAL rows kept unless force")
    public ImportResult importTranslations(@RequestBody ImportRequest body) {
        ImportResult r = service.importTranslations(body, SecurityUtil.currentUserId());
        audit.record("TRANSLATIONS_IMPORT", "TRANSLATION", body.locale(),
                "origin " + (body.origin() == null ? "AI" : body.origin())
                        + (Boolean.TRUE.equals(body.force()) ? ", force" : "")
                        + ": applied " + r.applied() + ", stale " + r.skippedStale()
                        + ", manual " + r.skippedManual() + ", notFound " + r.notFound()
                        + ", invalid " + r.invalid());
        if (r.applied() > 0) {
            // Translated text is on every page of the uk/en site (titles, categories, payment
            // methods) — without this it stayed stale until each page's ISR timer ran out.
            siteRevalidator.allChanged();
        }
        return r;
    }

    @PutMapping("/source-fix")
    @Operation(summary = "Proofreading: replace the Russian source of fields (optimistic by sourceHash) and "
            + "write uk/en translations of the new source in one transaction")
    public SourceFixResult fixSource(@RequestBody SourceFixRequest body) {
        SourceFixResult r = service.fixSource(body, SecurityUtil.currentUserId());
        SourceRef first = body.items().get(0);
        audit.record("TRANSLATIONS_SOURCE_FIX", first.entityType(), first.entityId(),
                "fields " + body.items().size() + " (" + first.field() + "): updated " + r.updated()
                        + ", stale " + r.skippedStale() + ", translations " + r.translationsApplied());
        if (r.updated() > 0 || r.translationsApplied() > 0) {
            siteRevalidator.allChanged();
        }
        return r;
    }

    @GetMapping("/stats")
    @Operation(summary = "translated / stale / missing per language and entity type")
    public Stats stats() {
        return service.stats();
    }

    @DeleteMapping
    @Operation(summary = "Delete translations of a language, optionally of one entity type / one entity")
    public DeleteResult delete(@RequestParam String locale,
                               @RequestParam(required = false) String entityType,
                               @RequestParam(required = false) String entityId,
                               @RequestParam(required = false) String field) {
        int deleted = service.delete(locale, entityType, entityId, field);
        audit.record("TRANSLATIONS_DELETE", "TRANSLATION", entityId == null ? locale : entityId,
                "locale " + locale + (entityType == null ? "" : ", " + entityType)
                        + (field == null || field.isBlank() ? "" : "." + field) + ": deleted " + deleted);
        if (deleted > 0) {
            siteRevalidator.allChanged();
        }
        return new DeleteResult(deleted);
    }
}
