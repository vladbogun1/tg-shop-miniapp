package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.translation.domain.TranslationError;
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

/** Proofreading: replaces the Russian source of fields and writes the uk/en translations of the new source with it. */
@Service
public class TranslationSourceFix {

    private final ContentTranslationRepository repository;
    private final TranslationRows store;
    /** Which source owns which entity type. */
    private final Map<TranslationEntityType, TranslatableSource> owners = new EnumMap<>(TranslationEntityType.class);

    TranslationSourceFix(ContentTranslationRepository repository, TranslationRows store,
                         List<TranslatableSource> sources) {
        this.repository = repository;
        this.store = store;
        for (TranslatableSource s : sources) {
            for (TranslationEntityType type : s.types()) {
                owners.put(type, s);
            }
        }
    }

    // ------------------------------------------------------------------ source fix (proofreading)

    /**
     * Replaces the Russian source of the given fields with the proofread text and writes the uk/en
     * translations of that NEW source in the same transaction - so the screen never leaves a field
     * whose translation is stale the moment it is saved. Optimistic: a field is touched only when
     * its current source still hashes to the {@code sourceHash} the admin saw (or already holds the
     * fix). Explicit admin action, so existing MANUAL translations of these fields are overwritten
     * (they were made for the old text anyway).
     */
    @Transactional
    public SourceFixResult fixSource(SourceFixRequest req, Long adminId) {
        if (req == null || req.items() == null || req.items().isEmpty()) {
            throw new DomainException.BadRequest(TranslationError.ITEMS_REQUIRED);
        }
        if (req.items().size() > TranslationLimits.MAX_FIX_ITEMS) {
            throw new DomainException.BadRequest(TranslationError.TOO_MANY_ITEMS, String.valueOf(TranslationLimits.MAX_FIX_ITEMS));
        }
        String newSource = req.source();
        if (TranslationRows.isBlank(newSource)) {
            throw new DomainException.BadRequest(TranslationError.SOURCE_BLANK);
        }
        Map<String, String> translations = checkedTranslations(req.translations());
        String newHash = SourceHash.sha256Hex(newSource);

        List<Rejected> rejected = new ArrayList<>();
        List<Key> updatedKeys = new ArrayList<>();
        int stale = 0;
        int notFound = 0;
        int invalid = 0;
        for (SourceRef ref : req.items()) {
            ImportItem asItem = ref == null ? null
                    : new ImportItem(ref.entityType(), ref.entityId(), ref.field(), ref.sourceHash(), newSource);
            String problem = asItem == null ? "INVALID_ITEM" : TranslationImport.validate(asItem);
            TranslationEntityType type = asItem == null ? null : TranslationEntityType.parse(ref.entityType());
            if (problem == null) {
                TranslatableSource owner = owners.get(type);
                Integer max = owner == null ? null : owner.maxSourceChars(type, ref.field());
                if (max != null && newSource.length() > max) {
                    problem = "INVALID_SOURCE_TOO_LONG";
                }
            }
            if (problem != null) {
                invalid++;
                TranslationImport.reject(rejected, asItem, problem);
                continue;
            }
            byte[] id = UuidUtil.toBytes(ref.entityId().trim());
            String wantedHash = ref.sourceHash().trim().toLowerCase(Locale.ROOT);
            String outcome = applySource(type, id, ref.field(), wantedHash, newSource, newHash);
            switch (outcome) {
                case "OK" -> updatedKeys.add(new Key(type, UuidUtil.toString(id), ref.field()));
                case "STALE" -> {
                    stale++;
                    TranslationImport.reject(rejected, asItem, "STALE");
                }
                case "NOT_FOUND" -> {
                    notFound++;
                    TranslationImport.reject(rejected, asItem, "NOT_FOUND");
                }
                default -> {
                    invalid++;
                    TranslationImport.reject(rejected, asItem, outcome);
                }
            }
        }

        int written = 0;
        if (!updatedKeys.isEmpty() && !translations.isEmpty()) {
            written = writeTranslations(updatedKeys, translations, newSource, newHash, adminId);
        }
        if (!updatedKeys.isEmpty()) {
            store.invalidate();
        }
        return new SourceFixResult(updatedKeys.size(), stale, notFound, invalid, written, newHash, rejected);
    }

    /** The non-blank translations of the request by locale; a bad locale or a too long text fails the request. */
    private static Map<String, String> checkedTranslations(Map<String, String> requested) {
        Map<String, String> translations = new LinkedHashMap<>();
        if (requested == null) {
            return translations;
        }
        for (Map.Entry<String, String> e : requested.entrySet()) {
            String l = TranslationRows.requireLocale(e.getKey());
            String text = e.getValue();
            if (TranslationRows.isBlank(text)) {
                continue;
            }
            if (text.length() > TranslationLimits.MAX_TEXT_CHARS
                    || text.getBytes(StandardCharsets.UTF_8).length > TranslationLimits.MAX_TEXT_BYTES) {
                throw new DomainException.BadRequest(TranslationError.TRANSLATION_TOO_LONG, l);
            }
            translations.put(l, text);
        }
        return translations;
    }

    /** Writes the translations of the new source for every updated field (origin AI, unreviewed); returns how many. */
    private int writeTranslations(List<Key> updatedKeys, Map<String, String> translations, String newSource,
                                  String newHash, Long adminId) {
        List<ContentTranslation> toSave = new ArrayList<>();
        for (Map.Entry<String, String> e : translations.entrySet()) {
            Map<Key, ContentTranslation> rows = store.existing(e.getKey());
            for (Key key : updatedKeys) {
                ContentTranslation row = rows.get(key);
                if (row == null) {
                    row = new ContentTranslation(new ContentTranslationId(key.type(),
                            UuidUtil.toBytes(key.entityId()), key.field(), e.getKey()));
                }
                row.setText(e.getValue());
                row.setSourceHash(newHash);
                row.setSourceText(newSource);
                row.setOrigin(TranslationOrigin.AI);
                row.setReviewedAt(null);
                row.setUpdatedBy(adminId);
                toSave.add(row);
            }
        }
        repository.saveAll(toSave);
        return toSave.size();
    }

    /** OK | STALE | NOT_FOUND | INVALID_* - sets one source field (the owner checks that its hash still matches). */
    private String applySource(TranslationEntityType type, byte[] id, String field, String wantedHash,
                               String newSource, String newHash) {
        TranslatableSource owner = owners.get(type);
        if (owner == null) {
            return "INVALID_ENTITY_TYPE";
        }
        return owner.applySource(new SourceChange(type, id, field, wantedHash, newSource, newHash));
    }

}
