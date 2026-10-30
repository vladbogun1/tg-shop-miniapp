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

/**
 * Writes translations into the stored rows: the import of a batch (a row is applied only when its source hash is
 * current, MANUAL rows are kept unless forced) and «Принять» of the review screen.
 */
@Service
public class TranslationImport {

    private static final Pattern SHA256_HEX = Pattern.compile("[0-9a-f]{64}");

    private final ContentTranslationRepository repository;
    private final TranslationRows store;
    private final Clock clock;

    TranslationImport(ContentTranslationRepository repository, TranslationRows store, Clock clock) {
        this.repository = repository;
        this.store = store;
        this.clock = clock;
    }

    // ------------------------------------------------------------------ import

    /**
     * Applies a batch of translations. A row is written only when its {@code sourceHash} equals the
     * hash of the current Russian source; an existing MANUAL row is kept unless {@code force}.
     */
    @Transactional
    public ImportResult importTranslations(ImportRequest req, Long adminId) {
        if (req == null) {
            throw TranslationErrors.badRequest("empty body");
        }
        String locale = TranslationRows.requireLocale(req.locale());
        TranslationOrigin origin = parseOrigin(req.origin());
        boolean force = Boolean.TRUE.equals(req.force());
        List<ImportItem> items = req.items() == null ? List.of() : req.items();
        if (items.size() > TranslationLimits.MAX_ITEMS) {
            throw TranslationErrors.badRequest("too many items (max " + TranslationLimits.MAX_ITEMS + ")");
        }

        Map<Key, Field> sources = store.sources();
        Map<Key, ContentTranslation> rows = store.existing(locale);
        Map<String, String> hashCache = new HashMap<>();
        Map<Key, ContentTranslation> toSave = new LinkedHashMap<>();
        List<Rejected> rejected = new ArrayList<>();
        int applied = 0;
        int stale = 0;
        int manual = 0;
        int notFound = 0;
        int invalid = 0;

        for (ImportItem item : items) {
            if (item == null) {
                invalid++;
                reject(rejected, null, "INVALID_ITEM");
                continue;
            }
            String problem = validate(item);
            if (problem != null) {
                invalid++;
                reject(rejected, item, problem);
                continue;
            }
            TranslationEntityType type = TranslationEntityType.parse(item.entityType());
            byte[] entityId = UuidUtil.toBytes(item.entityId().trim());
            Key key = new Key(type, UuidUtil.toString(entityId), item.field());

            Field src = sources.get(key);
            if (src == null) {
                notFound++;
                reject(rejected, item, "NOT_FOUND");
                continue;
            }
            if (TranslationRows.isBlank(src.text())) {
                notFound++;
                reject(rejected, item, "NO_SOURCE");
                continue;
            }
            String currentHash = hashCache.computeIfAbsent(src.text(), SourceHash::sha256Hex);
            if (!currentHash.equals(item.sourceHash().trim().toLowerCase(Locale.ROOT))) {
                stale++;
                reject(rejected, item, "STALE");
                continue;
            }
            ContentTranslation row = rows.get(key);
            if (row != null && row.getOrigin() == TranslationOrigin.MANUAL && !force) {
                manual++;
                reject(rejected, item, "MANUAL");
                continue;
            }
            if (row == null) {
                row = new ContentTranslation(new ContentTranslationId(type, entityId, key.field(), locale));
                rows.put(key, row);
            }
            row.setText(item.text());
            row.setSourceHash(currentHash);
            row.setSourceText(src.text());
            row.setOrigin(origin);
            // The admin's own text is checked by definition; AI output waits in «Проверить ИИ».
            row.setReviewedAt(origin == TranslationOrigin.MANUAL ? clock.instant() : null);
            row.setUpdatedBy(adminId);
            toSave.put(key, row);
            applied++;
        }

        if (!toSave.isEmpty()) {
            repository.saveAll(toSave.values());
            store.invalidate();
        }
        return new ImportResult(applied, stale, manual, notFound, invalid, rejected);
    }

    /** null when the item is well-formed, else an INVALID_* reason. */
    static String validate(ImportItem item) {
        TranslationEntityType type = TranslationEntityType.parse(item.entityType());
        if (type == null) {
            return "INVALID_ENTITY_TYPE";
        }
        if (!type.allows(item.field())) {
            return "INVALID_FIELD";
        }
        if (item.entityId() == null) {
            return "INVALID_ENTITY_ID";
        }
        try {
            UuidUtil.toBytes(item.entityId().trim());
        } catch (IllegalArgumentException e) {
            return "INVALID_ENTITY_ID";
        }
        if (item.sourceHash() == null
                || !SHA256_HEX.matcher(item.sourceHash().trim().toLowerCase(Locale.ROOT)).matches()) {
            return "INVALID_SOURCE_HASH";
        }
        if (TranslationRows.isBlank(item.text())) {
            return "INVALID_TEXT_BLANK";
        }
        if (item.text().length() > TranslationLimits.MAX_TEXT_CHARS
                || item.text().getBytes(StandardCharsets.UTF_8).length > TranslationLimits.MAX_TEXT_BYTES) {
            return "INVALID_TEXT_TOO_LONG";
        }
        return null;
    }

    static void reject(List<Rejected> out, ImportItem item, String reason) {
        if (out.size() >= TranslationLimits.MAX_REJECTED_LISTED) {
            return;
        }
        out.add(item == null
                ? new Rejected(null, null, null, reason)
                : new Rejected(item.entityType(), item.entityId(), item.field(), reason));
    }


    // ------------------------------------------------------------------ accept (review)

    /**
     * «Принять»: marks translations as checked by a person. A STALE row whose text the admin
     * confirmed for the current source (a typo fixed in Russian, the translation still fits) is
     * re-bound to it. The admin must have seen the current source: {@code sourceHash} is compared
     * with it, an older one is skipped.
     */
    @Transactional
    public AcceptResult accept(AcceptRequest req, Long adminId) {
        List<AcceptItem> items = req == null || req.items() == null ? List.of() : req.items();
        if (items.size() > TranslationLimits.MAX_ITEMS) {
            throw TranslationErrors.badRequest("too many items (max " + TranslationLimits.MAX_ITEMS + ")");
        }
        Map<Key, Field> sources = store.sources();
        Map<String, Map<Key, ContentTranslation>> rowsByLocale = new HashMap<>();
        List<ContentTranslation> toSave = new ArrayList<>();
        Instant now = clock.instant();
        int rebased = 0;
        int stale = 0;
        int notFound = 0;
        int invalid = 0;
        for (AcceptItem item : items) {
            String locale = item == null || item.locale() == null ? "" : item.locale().trim().toLowerCase(Locale.ROOT);
            if (item == null || !ContentLocale.TRANSLATED.contains(locale)
                    || validate(new ImportItem(item.entityType(), item.entityId(), item.field(), item.sourceHash(), "x"))
                    != null) {
                invalid++;
                continue;
            }
            TranslationEntityType type = TranslationEntityType.parse(item.entityType());
            Key key = new Key(type, UuidUtil.toString(UuidUtil.toBytes(item.entityId().trim())), item.field());
            Field src = sources.get(key);
            ContentTranslation row = rowsByLocale.computeIfAbsent(locale, store::existing).get(key);
            if (src == null || TranslationRows.isBlank(src.text()) || row == null) {
                notFound++;
                continue;
            }
            String currentHash = SourceHash.sha256Hex(src.text());
            if (!currentHash.equals(item.sourceHash().trim().toLowerCase(Locale.ROOT))) {
                stale++;
                continue;
            }
            if (toSave.contains(row)) {
                continue;
            }
            if (!currentHash.equals(row.getSourceHash())) {
                row.setSourceHash(currentHash);
                rebased++;
            }
            row.setSourceText(src.text());
            row.setReviewedAt(now);
            row.setUpdatedBy(adminId);
            toSave.add(row);
        }
        if (!toSave.isEmpty()) {
            repository.saveAll(toSave);
            if (rebased > 0) {
                store.invalidate();
            }
        }
        return new AcceptResult(toSave.size(), rebased, stale, notFound, invalid);
    }

    private static TranslationOrigin parseOrigin(String origin) {
        if (origin == null || origin.isBlank()) {
            return TranslationOrigin.AI;
        }
        try {
            return TranslationOrigin.valueOf(origin.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw TranslationErrors.badRequest("origin must be AI or MANUAL");
        }
    }

}
