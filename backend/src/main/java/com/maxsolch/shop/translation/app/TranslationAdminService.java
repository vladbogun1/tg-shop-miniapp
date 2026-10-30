package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.translation.domain.SourceHash;
import com.maxsolch.shop.translation.domain.ContentLocale;
import com.maxsolch.shop.translation.domain.ContentTranslation;
import com.maxsolch.shop.translation.domain.ContentTranslationId;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.translation.domain.TranslationOrigin;
import com.maxsolch.shop.translation.infra.ContentTranslationRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.translation.app.TranslationDtos.AcceptItem;
import com.maxsolch.shop.translation.app.TranslationDtos.AcceptRequest;
import com.maxsolch.shop.translation.app.TranslationDtos.AcceptResult;
import com.maxsolch.shop.translation.app.TranslationDtos.Counts;
import com.maxsolch.shop.translation.app.TranslationDtos.ExportItem;
import com.maxsolch.shop.translation.app.TranslationDtos.ImportItem;
import com.maxsolch.shop.translation.app.TranslationDtos.ImportRequest;
import com.maxsolch.shop.translation.app.TranslationDtos.ImportResult;
import com.maxsolch.shop.translation.app.TranslationDtos.Rejected;
import com.maxsolch.shop.translation.app.TranslationDtos.SourceFixRequest;
import com.maxsolch.shop.translation.app.TranslationDtos.SourceFixResult;
import com.maxsolch.shop.translation.app.TranslationDtos.SourceRef;
import com.maxsolch.shop.translation.app.TranslationDtos.Stats;
import com.maxsolch.shop.translation.app.TranslationDtos.Status;
import com.maxsolch.shop.translation.app.TranslationDtos.TextCounts;
import com.maxsolch.shop.translation.app.TranslatableSource.Field;
import com.maxsolch.shop.translation.app.TranslatableSource.SourceChange;
import com.maxsolch.shop.translation.app.TranslationService.Key;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.translation.domain.TranslationErrors;
import com.maxsolch.shop.translation.domain.TranslationsChanged;
import java.time.Clock;
import java.time.Instant;
import java.util.EnumMap;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import lombok.extern.slf4j.Slf4j;

/** Upkeep of the stored translations: the source snapshot backfill, targeted delete and the orphan sweep. */
@Slf4j
@Service
public class TranslationAdminService {

    private final ContentTranslationRepository repository;
    private final TranslationRows store;

    TranslationAdminService(ContentTranslationRepository repository, TranslationRows store) {
        this.repository = repository;
        this.store = store;
    }


    /**
     * Fills {@code source_text} (V56) of the rows that are current but were written before it, so
     * that once their source changes the screen can show the difference. Idempotent and cheap after
     * the first run (rows already filled or stale are skipped); does not touch {@code updated_at}.
     */
    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void backfillSourceTexts() {
        try {
            Map<Key, Field> sources = store.sources();
            Map<String, String> hashes = new HashMap<>();
            int filled = 0;
            for (String l : ContentLocale.TRANSLATED) {
                for (Map.Entry<Key, ContentTranslation> e : store.existing(l).entrySet()) {
                    ContentTranslation row = e.getValue();
                    Field src = sources.get(e.getKey());
                    if (row.getSourceText() != null || src == null || TranslationRows.isBlank(src.text())
                            || !hashes.computeIfAbsent(src.text(), SourceHash::sha256Hex)
                            .equals(row.getSourceHash())) {
                        continue;
                    }
                    ContentTranslationId id = row.getId();
                    filled += repository.fillSourceText(id.getEntityType().name(), id.getEntityId(), id.getField(),
                            id.getLocale(), src.text());
                }
            }
            if (filled > 0) {
                log.info("Saved the Russian source snapshot of {} translation(s)", filled);
            }
        } catch (RuntimeException e) {
            log.warn("Translation source snapshot backfill failed: {}", e.toString());
        }
    }

    // ------------------------------------------------------------------ delete / orphans

    /** {@code entityType} optional; {@code entityId} optional and only together with entityType. */
    @Transactional
    public int delete(String locale, String entityType, String entityId) {
        return delete(locale, entityType, entityId, null);
    }

    /**
     * As {@link #delete(String, String, String)}; {@code field} (optional, needs entityId) resets a
     * single field - the "reset translation" action of the admin screen.
     */
    @Transactional
    public int delete(String locale, String entityType, String entityId, String field) {
        String l = TranslationRows.requireLocale(locale);
        boolean oneField = field != null && !field.isBlank();
        if (oneField && (entityId == null || entityId.isBlank())) {
            throw TranslationErrors.badRequest("field requires entityType and entityId");
        }
        TranslationEntityType type = TranslationRows.parseTypeOrNull(entityType);
        int deleted;
        if (entityId != null && !entityId.isBlank()) {
            if (type == null) {
                throw TranslationErrors.badRequest("entityId requires entityType");
            }
            byte[] id;
            try {
                id = UuidUtil.toBytes(entityId.trim());
            } catch (IllegalArgumentException e) {
                throw TranslationErrors.badRequest("invalid entityId");
            }
            if (oneField) {
                if (!type.allows(field.trim())) {
                    throw TranslationErrors.badRequest("field is not translatable for " + type.name());
                }
                deleted = repository.deleteByLocaleAndEntityAndField(l, type, id, field.trim());
            } else {
                deleted = repository.deleteByLocaleAndEntity(l, type, id);
            }
        } else if (type != null) {
            deleted = repository.deleteByLocaleAndType(l, type);
        } else {
            deleted = repository.deleteByLocale(l);
        }
        if (deleted > 0) {
            store.invalidate();
        }
        return deleted;
    }

    /** Rows whose entity no longer exists (no FKs on the shared table); called daily by {@link TranslationJobs}. */
    @Transactional
    public int cleanupOrphans() {
        int removed = repository.deleteOrphanProducts()
                + repository.deleteOrphanVariants()
                + repository.deleteOrphanTags()
                + repository.deleteOrphanCategories()
                + repository.deleteOrphanPaymentOptions()
                + repository.deleteOrphanReplyTemplates();
        if (removed > 0) {
            log.info("Removed {} orphaned content translation(s)", removed);
            store.invalidate();
        }
        return removed;
    }

}
