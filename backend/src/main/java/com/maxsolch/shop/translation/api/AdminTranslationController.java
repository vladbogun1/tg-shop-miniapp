package com.maxsolch.shop.translation.api;

import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.platform.security.RequiredSuperAdmin;
import com.maxsolch.shop.translation.app.AdminTranslations;
import com.maxsolch.shop.translation.app.TranslationDtos.AcceptRequest;
import com.maxsolch.shop.translation.app.TranslationDtos.AcceptResult;
import com.maxsolch.shop.translation.app.TranslationDtos.DeleteResult;
import com.maxsolch.shop.translation.app.TranslationDtos.ExportItem;
import com.maxsolch.shop.translation.app.TranslationDtos.ImportRequest;
import com.maxsolch.shop.translation.app.TranslationDtos.ImportResult;
import com.maxsolch.shop.translation.app.TranslationDtos.SourceFixRequest;
import com.maxsolch.shop.translation.app.TranslationDtos.SourceFixResult;
import com.maxsolch.shop.translation.app.TranslationDtos.Stats;
import com.maxsolch.shop.translation.app.TranslationReport;
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

    private final TranslationReport report;
    private final AdminTranslations admin;

    public AdminTranslationController(TranslationReport report, AdminTranslations admin) {
        this.report = report;
        this.admin = admin;
    }

    @GetMapping("/export")
    @Operation(summary = "Translatable fields with source, sourceHash and status. status: missing|stale|translated|all")
    public List<ExportItem> export(@RequestParam String locale,
                                   @RequestParam(required = false, defaultValue = "all") String status,
                                   @RequestParam(required = false) String entityType) {
        return report.export(locale, status, entityType);
    }

    @PutMapping("/import")
    @Operation(summary = "Import translations; applied only when sourceHash matches the current source, "
            + "MANUAL rows kept unless force")
    public ImportResult importTranslations(@RequestBody ImportRequest body) {
        return admin.importTranslations(body);
    }

    @PutMapping("/source-fix")
    @Operation(summary = "Proofreading: replace the Russian source of fields (optimistic by sourceHash) and "
            + "write uk/en translations of the new source in one transaction")
    public SourceFixResult fixSource(@RequestBody SourceFixRequest body) {
        return admin.fixSource(body);
    }

    @PutMapping("/accept")
    @Operation(summary = "Mark translations as checked by a person; a stale one is re-bound to the current source "
            + "(the admin confirmed it still fits)")
    public AcceptResult accept(@RequestBody AcceptRequest body) {
        return admin.accept(body);
    }

    @GetMapping("/stats")
    @Operation(summary = "translated / stale / missing per language and entity type")
    public Stats stats() {
        return report.stats();
    }

    /** Reset of ONE entity (a field of a product...): any admin. A blank entityId would mean the whole language. */
    @DeleteMapping(params = "entityId")
    @Operation(summary = "Delete translations of one entity (optionally one field)")
    public DeleteResult delete(@RequestParam String locale,
                               @RequestParam(required = false) String entityType,
                               @RequestParam String entityId,
                               @RequestParam(required = false) String field) {
        return admin.delete(locale, entityType, entityId, field);
    }

    /** A whole language (optionally one entity type) — for good, so the main admin only. */
    @DeleteMapping(params = "!entityId")
    @RequiredSuperAdmin
    @Operation(summary = "Delete translations of a whole language / entity type (main admin only)")
    public DeleteResult deleteLanguage(@RequestParam String locale,
                                       @RequestParam(required = false) String entityType,
                                       @RequestParam(required = false) String field) {
        return admin.deleteLanguage(locale, entityType, field);
    }
}
