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
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
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

/**
 * Write side of the content translations: export of sources, import with the staleness and MANUAL
 * checks, stats, targeted delete and the orphan sweep (docs/CONTENT-I18N.md).
 */
@Slf4j
@Service
public class TranslationAdminService {

    public static final int MAX_TEXT_CHARS = 20_000;
    /** {@code TEXT} holds 65 535 bytes; 20 000 emoji would not fit. */
    static final int MAX_TEXT_BYTES = 65_535;
    public static final int MAX_ITEMS = 20_000;
    /** Fields sharing one proofread source (a description reused by many products). */
    static final int MAX_FIX_ITEMS = 2_000;
    /** Rejected keys returned to the caller; the counters stay exact beyond that. */
    static final int MAX_REJECTED_LISTED = 2_000;

    private static final Pattern SHA256_HEX = Pattern.compile("[0-9a-f]{64}");

    private final ContentTranslationRepository repository;
    private final TranslationService translationService;
    private final BotTexts botTexts;
    private final DomainEvents events;
    private final Clock clock;
    private final List<TranslatableSource> sourceList;
    /** Which source owns which entity type. */
    private final Map<TranslationEntityType, TranslatableSource> owners = new EnumMap<>(TranslationEntityType.class);

    public TranslationAdminService(ContentTranslationRepository repository,
                                   TranslationService translationService,
                                   BotTexts botTexts,
                                   DomainEvents events,
                                   Clock clock,
                                   List<TranslatableSource> sources) {
        this.repository = repository;
        this.translationService = translationService;
        this.botTexts = botTexts;
        this.events = events;
        this.clock = clock;
        this.sourceList = sources;
        for (TranslatableSource s : sources) {
            for (TranslationEntityType type : s.types()) {
                owners.put(type, s);
            }
        }
    }

    // ------------------------------------------------------------------ export / stats

    @Transactional(readOnly = true)
    public List<ExportItem> export(String locale, String status, String entityType) {
        String l = requireLocale(locale);
        Status wanted = parseStatus(status);
        TranslationEntityType type = parseTypeOrNull(entityType);
        Map<Key, ContentTranslation> rows = withBuiltinBotTexts(existing(l), l);

        List<ExportItem> out = new ArrayList<>();
        for (Map.Entry<Key, Field> e : sources().entrySet()) {
            Key key = e.getKey();
            Field src = e.getValue();
            if (!src.inScope() || isBlank(src.text()) || (type != null && key.type() != type)) {
                continue;
            }
            String hash = SourceHash.sha256Hex(src.text());
            ContentTranslation row = rows.get(key);
            Status st = statusOf(row, hash);
            if (wanted != null && wanted != st) {
                continue;
            }
            out.add(new ExportItem(key.type().name(), key.entityId(), key.field(), src.text(), hash, st.name(),
                    row == null ? null : row.getText(),
                    row == null ? null : row.getOrigin().name(),
                    src.ownerId(), src.ownerTitle(),
                    st == Status.STALE ? row.getSourceText() : null,
                    row != null && isReviewed(row)));
        }
        out.sort(EXPORT_ORDER);
        return out;
    }

    private static final Comparator<ExportItem> EXPORT_ORDER = Comparator
            .comparingInt((ExportItem i) -> TranslationEntityType.valueOf(i.entityType()).ordinal())
            .thenComparing(ExportItem::entityId)
            .thenComparingInt(i -> TranslationEntityType.valueOf(i.entityType()).fields().indexOf(i.field()));

    @Transactional(readOnly = true)
    public Stats stats() {
        Map<Key, Field> sources = sources();
        Map<String, Map<String, Counts>> locales = new LinkedHashMap<>();
        // Bucket of every unique source text: 0 missing, 1 stale, 2 review, 3 done (lowest wins).
        Map<String, Integer> textBucket = new HashMap<>();
        Map<String, String> hashes = new HashMap<>();
        for (String l : ContentLocale.TRANSLATED) {
            Map<Key, ContentTranslation> rows = withBuiltinBotTexts(existing(l), l);
            Map<String, int[]> acc = new LinkedHashMap<>();
            for (TranslationEntityType t : TranslationEntityType.values()) {
                if (t.translatable()) {
                    acc.put(t.name(), new int[4]);
                }
            }
            acc.put("ALL", new int[4]);
            for (Map.Entry<Key, Field> e : sources.entrySet()) {
                Field src = e.getValue();
                if (!src.inScope() || isBlank(src.text())) {
                    continue;
                }
                String hash = hashes.computeIfAbsent(src.text(), SourceHash::sha256Hex);
                ContentTranslation row = rows.get(e.getKey());
                Status st = statusOf(row, hash);
                boolean unreviewed = st == Status.TRANSLATED && !isReviewed(row);
                for (int[] c : List.of(acc.get(e.getKey().type().name()), acc.get("ALL"))) {
                    c[st.ordinal()]++;
                    if (unreviewed) {
                        c[3]++;
                    }
                }
                int bucket = switch (st) {
                    case MISSING -> 0;
                    case STALE -> 1;
                    case TRANSLATED -> unreviewed ? 2 : 3;
                };
                textBucket.merge(hash, bucket, Math::min);
            }
            Map<String, Counts> counts = new LinkedHashMap<>();
            acc.forEach((k, v) -> counts.put(k, new Counts(v[0], v[1], v[2], v[3])));
            locales.put(l, counts);
        }
        int[] texts = new int[4];
        textBucket.values().forEach(b -> texts[b]++);
        return new Stats(locales, new TextCounts(texts[0], texts[1], texts[2], texts[3]));
    }

    /** MANUAL text is the admin's own; AI text counts once someone accepted it. */
    static boolean isReviewed(ContentTranslation row) {
        return row.getOrigin() == TranslationOrigin.MANUAL || row.getReviewedAt() != null;
    }

    private static Status statusOf(ContentTranslation row, String currentHash) {
        if (row == null) {
            return Status.MISSING;
        }
        return currentHash.equals(row.getSourceHash()) ? Status.TRANSLATED : Status.STALE;
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
        String locale = requireLocale(req.locale());
        TranslationOrigin origin = parseOrigin(req.origin());
        boolean force = Boolean.TRUE.equals(req.force());
        List<ImportItem> items = req.items() == null ? List.of() : req.items();
        if (items.size() > MAX_ITEMS) {
            throw TranslationErrors.badRequest("too many items (max " + MAX_ITEMS + ")");
        }

        Map<Key, Field> sources = sources();
        Map<Key, ContentTranslation> rows = existing(locale);
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
            if (isBlank(src.text())) {
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
            invalidateAfterCommit();
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
        if (isBlank(item.text())) {
            return "INVALID_TEXT_BLANK";
        }
        if (item.text().length() > MAX_TEXT_CHARS
                || item.text().getBytes(StandardCharsets.UTF_8).length > MAX_TEXT_BYTES) {
            return "INVALID_TEXT_TOO_LONG";
        }
        return null;
    }

    private static void reject(List<Rejected> out, ImportItem item, String reason) {
        if (out.size() >= MAX_REJECTED_LISTED) {
            return;
        }
        out.add(item == null
                ? new Rejected(null, null, null, reason)
                : new Rejected(item.entityType(), item.entityId(), item.field(), reason));
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
            throw TranslationErrors.badRequest("items required");
        }
        if (req.items().size() > MAX_FIX_ITEMS) {
            throw TranslationErrors.badRequest("too many items (max " + MAX_FIX_ITEMS + ")");
        }
        String newSource = req.source();
        if (isBlank(newSource)) {
            throw TranslationErrors.badRequest("source must not be blank");
        }
        Map<String, String> translations = new LinkedHashMap<>();
        if (req.translations() != null) {
            for (Map.Entry<String, String> e : req.translations().entrySet()) {
                String l = requireLocale(e.getKey());
                String text = e.getValue();
                if (isBlank(text)) {
                    continue;
                }
                if (text.length() > MAX_TEXT_CHARS
                        || text.getBytes(StandardCharsets.UTF_8).length > MAX_TEXT_BYTES) {
                    throw TranslationErrors.badRequest("translation " + l + " is too long");
                }
                translations.put(l, text);
            }
        }
        String newHash = SourceHash.sha256Hex(newSource);

        List<Rejected> rejected = new ArrayList<>();
        List<Key> updatedKeys = new ArrayList<>();
        int stale = 0;
        int notFound = 0;
        int invalid = 0;
        for (SourceRef ref : req.items()) {
            ImportItem asItem = ref == null ? null
                    : new ImportItem(ref.entityType(), ref.entityId(), ref.field(), ref.sourceHash(), newSource);
            String problem = asItem == null ? "INVALID_ITEM" : validate(asItem);
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
                reject(rejected, asItem, problem);
                continue;
            }
            byte[] id = UuidUtil.toBytes(ref.entityId().trim());
            String wantedHash = ref.sourceHash().trim().toLowerCase(Locale.ROOT);
            String outcome = applySource(type, id, ref.field(), wantedHash, newSource, newHash);
            switch (outcome) {
                case "OK" -> updatedKeys.add(new Key(type, UuidUtil.toString(id), ref.field()));
                case "STALE" -> {
                    stale++;
                    reject(rejected, asItem, "STALE");
                }
                case "NOT_FOUND" -> {
                    notFound++;
                    reject(rejected, asItem, "NOT_FOUND");
                }
                default -> {
                    invalid++;
                    reject(rejected, asItem, outcome);
                }
            }
        }

        int written = 0;
        if (!updatedKeys.isEmpty() && !translations.isEmpty()) {
            List<ContentTranslation> toSave = new ArrayList<>();
            for (Map.Entry<String, String> e : translations.entrySet()) {
                Map<Key, ContentTranslation> rows = existing(e.getKey());
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
            written = toSave.size();
        }
        if (!updatedKeys.isEmpty()) {
            invalidateAfterCommit();
        }
        return new SourceFixResult(updatedKeys.size(), stale, notFound, invalid, written, newHash, rejected);
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
        if (items.size() > MAX_ITEMS) {
            throw TranslationErrors.badRequest("too many items (max " + MAX_ITEMS + ")");
        }
        Map<Key, Field> sources = sources();
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
            ContentTranslation row = rowsByLocale.computeIfAbsent(locale, this::existing).get(key);
            if (src == null || isBlank(src.text()) || row == null) {
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
                invalidateAfterCommit();
            }
        }
        return new AcceptResult(toSave.size(), rebased, stale, notFound, invalid);
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
            Map<Key, Field> sources = sources();
            Map<String, String> hashes = new HashMap<>();
            int filled = 0;
            for (String l : ContentLocale.TRANSLATED) {
                for (Map.Entry<Key, ContentTranslation> e : existing(l).entrySet()) {
                    ContentTranslation row = e.getValue();
                    Field src = sources.get(e.getKey());
                    if (row.getSourceText() != null || src == null || isBlank(src.text())
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
        String l = requireLocale(locale);
        boolean oneField = field != null && !field.isBlank();
        if (oneField && (entityId == null || entityId.isBlank())) {
            throw TranslationErrors.badRequest("field requires entityType and entityId");
        }
        TranslationEntityType type = parseTypeOrNull(entityType);
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
            invalidateAfterCommit();
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
            invalidateAfterCommit();
        }
        return removed;
    }

    // ------------------------------------------------------------------ internals

    /** Every translatable field of every existing entity, with its current Russian source. */
    Map<Key, Field> sources() {
        Map<Key, Field> out = new HashMap<>();
        for (TranslatableSource s : sourceList) {
            out.putAll(s.fields());
        }
        return out;
    }

    /**
     * Bot phrases without a stored translation are not «missing»: the shipped messages_uk/en text is what
     * customers get, so it is reported as a reviewed translation of the shipped Russian text. When the owner
     * edits the Russian source it no longer matches that hash and shows up as STALE. Read-only view for the
     * export and the counters; imports and accepts keep working on the stored rows.
     */
    private Map<Key, ContentTranslation> withBuiltinBotTexts(Map<Key, ContentTranslation> rows, String locale) {
        for (String key : BotTexts.KEYS) {
            String text = botTexts.builtin(locale, key);
            String ru = botTexts.builtinRu(key);
            if (text == null || ru == null) {
                continue;
            }
            Key k = new Key(TranslationEntityType.BOT_TEXT, BotTexts.idStringOf(key), TranslationEntityType.BODY);
            if (rows.containsKey(k)) {
                continue;
            }
            ContentTranslation row = new ContentTranslation(new ContentTranslationId(
                    TranslationEntityType.BOT_TEXT, BotTexts.idOf(key), TranslationEntityType.BODY, locale));
            row.setText(text);
            row.setSource(ru);
            row.setOrigin(TranslationOrigin.MANUAL); // shipped by hand: nothing to review
            rows.put(k, row);
        }
        return rows;
    }

    private Map<Key, ContentTranslation> existing(String locale) {
        Map<Key, ContentTranslation> rows = new HashMap<>();
        for (ContentTranslation t : repository.findByLocale(locale)) {
            ContentTranslationId id = t.getId();
            rows.put(new Key(id.getEntityType(), UuidUtil.toString(id.getEntityId()), id.getField()), t);
        }
        return rows;
    }

    /** Whoever keeps translated text in memory (snapshots, bot phrases, catalog caches) drops it after the commit. */
    private void invalidateAfterCommit() {
        events.publish(new TranslationsChanged());
    }

    static String requireLocale(String locale) {
        String l = locale == null ? "" : locale.trim().toLowerCase(Locale.ROOT);
        if (!ContentLocale.TRANSLATED.contains(l)) {
            throw TranslationErrors.badRequest("locale must be one of " + ContentLocale.TRANSLATED);
        }
        return l;
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

    private static Status parseStatus(String status) {
        if (status == null || status.isBlank() || "all".equalsIgnoreCase(status.trim())) {
            return null;
        }
        try {
            return Status.valueOf(status.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw TranslationErrors.badRequest("status must be missing|stale|translated|all");
        }
    }

    private static TranslationEntityType parseTypeOrNull(String entityType) {
        if (entityType == null || entityType.isBlank()) {
            return null;
        }
        TranslationEntityType type = TranslationEntityType.parse(entityType);
        if (type == null) {
            throw TranslationErrors.badRequest(
                    "entityType must be one of PRODUCT, VARIANT, CATEGORY, PAYMENT_OPTION, REPLY_TEMPLATE, BOT_TEXT");
        }
        return type;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
