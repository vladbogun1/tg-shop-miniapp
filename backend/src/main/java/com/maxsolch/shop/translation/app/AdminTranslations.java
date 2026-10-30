package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.site.app.SiteRevalidator;
import com.maxsolch.shop.translation.app.TranslationDtos.AcceptRequest;
import com.maxsolch.shop.translation.app.TranslationDtos.AcceptResult;
import com.maxsolch.shop.translation.app.TranslationDtos.DeleteResult;
import com.maxsolch.shop.translation.app.TranslationDtos.ImportRequest;
import com.maxsolch.shop.translation.app.TranslationDtos.ImportResult;
import com.maxsolch.shop.translation.app.TranslationDtos.SourceFixRequest;
import com.maxsolch.shop.translation.app.TranslationDtos.SourceFixResult;
import com.maxsolch.shop.translation.app.TranslationDtos.SourceRef;
import org.springframework.stereotype.Service;

/**
 * What the admin does on the «Переводы» screen, one method per button: runs the write scenario, journals it and
 * rebuilds the site when translated text became visible there. Not {@code @Transactional}: audit entries are
 * written on their own, after the scenario's transaction has committed.
 */
@Service
public class AdminTranslations {

    private final TranslationImport imports;
    private final TranslationSourceFix sourceFix;
    private final TranslationAdminService upkeep;
    private final AdminAuditService audit;
    private final SiteRevalidator siteRevalidator;
    private final AdminAccess adminAccess;
    private final CurrentActor actor;

    public AdminTranslations(TranslationImport imports, TranslationSourceFix sourceFix,
                             TranslationAdminService upkeep, AdminAuditService audit,
                             SiteRevalidator siteRevalidator, AdminAccess adminAccess, CurrentActor actor) {
        this.imports = imports;
        this.sourceFix = sourceFix;
        this.upkeep = upkeep;
        this.audit = audit;
        this.siteRevalidator = siteRevalidator;
        this.adminAccess = adminAccess;
        this.actor = actor;
    }

    public ImportResult importTranslations(ImportRequest body) {
        ImportResult r = imports.importTranslations(body, actor.userId());
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

    public SourceFixResult fixSource(SourceFixRequest body) {
        SourceFixResult r = sourceFix.fixSource(body, actor.userId());
        SourceRef first = body.items().get(0);
        audit.record("TRANSLATIONS_SOURCE_FIX", first.entityType(), first.entityId(),
                "fields " + body.items().size() + " (" + first.field() + "): updated " + r.updated()
                        + ", stale " + r.skippedStale() + ", translations " + r.translationsApplied());
        if (r.updated() > 0 || r.translationsApplied() > 0) {
            siteRevalidator.allChanged();
        }
        return r;
    }

    public AcceptResult accept(AcceptRequest body) {
        AcceptResult r = imports.accept(body, actor.userId());
        audit.record("TRANSLATIONS_ACCEPT", "TRANSLATION", "review",
                "accepted " + r.accepted() + ", rebased " + r.rebased() + ", stale " + r.skippedStale()
                        + ", notFound " + r.notFound() + ", invalid " + r.invalid());
        if (r.rebased() > 0) {
            // A re-bound stale translation is visible again on the uk/en site.
            siteRevalidator.allChanged();
        }
        return r;
    }

    /**
     * Reset of one entity (a field of a product...): any admin. A blank {@code entityId} would mean the whole
     * language, which is for good, so that case is for the main admin only. The rule depends on the request
     * parameter, which a method annotation cannot see: it is checked here, before anything is deleted.
     */
    public DeleteResult delete(String locale, String entityType, String entityId, String field) {
        if (entityId.isBlank()) {
            adminAccess.requireSuperAdmin(actor.userId(), "Удаление переводов целого языка");
        }
        return doDelete(locale, entityType, entityId.isBlank() ? null : entityId, field);
    }

    /** A whole language (optionally one entity type); the controller method carries {@code @RequiredSuperAdmin}. */
    public DeleteResult deleteLanguage(String locale, String entityType, String field) {
        return doDelete(locale, entityType, null, field);
    }

    private DeleteResult doDelete(String locale, String entityType, String entityId, String field) {
        int deleted = upkeep.delete(locale, entityType, entityId, field);
        audit.record("TRANSLATIONS_DELETE", "TRANSLATION", entityId == null ? locale : entityId,
                "locale " + locale + (entityType == null ? "" : ", " + entityType)
                        + (field == null || field.isBlank() ? "" : "." + field) + ": deleted " + deleted);
        if (deleted > 0) {
            siteRevalidator.allChanged();
        }
        return new DeleteResult(deleted);
    }
}
