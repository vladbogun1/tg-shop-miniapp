package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.ResultWriter;
import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.site.app.SiteRevalidator;
import com.maxsolch.shop.translation.app.TranslationDtos.ImportItem;
import com.maxsolch.shop.translation.app.TranslationDtos.ImportResult;
import com.maxsolch.shop.translation.domain.ContentLocale;
import com.maxsolch.shop.translation.domain.ContentTranslation;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Writes the answer of a translation task: the strings the task asked about become translations of every place they
 * stand in, as drafts of the built-in AI (they wait in «Проверить ИИ» until a person accepts them, and customers see
 * them like any AI text). What is written and what is not is decided by {@link AiTranslationPlan}; the writing itself
 * is the import of this module ({@link TranslationImport#importBuiltinAi}), not a direct write into the table, so the
 * hash of the source is checked again at the moment of writing and a translation a person wrote is never replaced.
 * When the admin asked for one language (the line «Языки перевода» of the prompt), only that one is written.
 * Runs on the server in the task's thread: the admin who started the task is the job's, not the request's.
 */
@Service
public class AiTranslationApply implements ResultWriter {

    private final TranslationRows store;
    private final TranslationReport report;
    private final TranslationImport imports;
    private final AdminAuditService audit;
    private final SiteRevalidator site;
    private final TransactionTemplate readOnly;

    AiTranslationApply(TranslationRows store, TranslationReport report, TranslationImport imports,
                       AdminAuditService audit, SiteRevalidator site, PlatformTransactionManager tx) {
        this.store = store;
        this.report = report;
        this.imports = imports;
        this.audit = audit;
        this.site = site;
        this.readOnly = new TransactionTemplate(tx);
        this.readOnly.setReadOnly(true);
    }

    @Override
    public AiFeature feature() {
        return AiFeature.TRANSLATION;
    }

    @Override
    public Written write(AiJob job, String prompt, String answer) {
        AiTranslationPlan.Result plan = readOnly.execute(status -> {
            Map<String, Map<TranslationService.Key,
                    ContentTranslation>> rows = new HashMap<>();
            ContentLocale.TRANSLATED.forEach(l -> rows.put(l, report.rowsOf(l)));
            return new AiTranslationPlan(store.sources(), rows,
                    TranslationAnswerJson.locales(prompt, ContentLocale.TRANSLATED))
                    .plan(TranslationAnswerJson.asked(prompt), TranslationAnswerJson.answers(answer));
        });
        int applied = 0;
        int rejected = plan.rejected();
        int ignored = plan.ignoredLocked();
        for (Map.Entry<String, List<ImportItem>> e : plan.items().entrySet()) {
            if (e.getValue().isEmpty()) {
                continue;
            }
            ImportResult r = imports.importBuiltinAi(e.getKey(), e.getValue(), job.getAdminId());
            applied += r.applied();
            rejected += r.skippedStale() + r.notFound() + r.invalid();
            ignored += r.skippedManual();
        }
        audit.recordFor(job.getAdminId(), "TRANSLATIONS_AI", "TRANSLATION", "job " + job.getId(),
                "ИИ-перевод: записано " + applied + ", не записано " + rejected + ", ручные оставлены " + ignored);
        if (applied > 0) {
            site.allChanged();
        }
        return new Written(applied, rejected, ignored);
    }
}
