package com.maxsolch.shop.translation;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.PaymentOption;
import com.maxsolch.shop.domain.PaymentRequisites;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.domain.Tag;
import com.maxsolch.shop.repository.PaymentOptionRepository;
import com.maxsolch.shop.repository.PaymentRequisitesRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.ProductVariantRepository;
import com.maxsolch.shop.repository.TagRepository;
import com.maxsolch.shop.translation.TranslationDtos.Counts;
import com.maxsolch.shop.translation.TranslationDtos.ExportItem;
import com.maxsolch.shop.translation.TranslationDtos.ImportItem;
import com.maxsolch.shop.translation.TranslationDtos.ImportRequest;
import com.maxsolch.shop.translation.TranslationDtos.ImportResult;
import com.maxsolch.shop.translation.TranslationDtos.Rejected;
import com.maxsolch.shop.translation.TranslationDtos.SourceFixRequest;
import com.maxsolch.shop.translation.TranslationDtos.SourceFixResult;
import com.maxsolch.shop.translation.TranslationDtos.SourceRef;
import com.maxsolch.shop.translation.TranslationDtos.Stats;
import com.maxsolch.shop.translation.TranslationDtos.Status;
import com.maxsolch.shop.translation.TranslationService.Key;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.dto.TagUpsertRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
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
    private static final List<String> CATALOG_CACHES = List.of("products", "productById", "tags");

    /**
     * The Russian source of one field; {@code inScope} = part of the export (live entity);
     * {@code productId}/{@code productTitle} = owning product of PRODUCT/VARIANT fields, else null.
     */
    record Source(String text, boolean inScope, String productId, String productTitle) {
        Source(String text, boolean inScope) {
            this(text, inScope, null, null);
        }
    }

    /** Column sizes of the Russian sources ({@code entityType:field} -> max chars). */
    private static final Map<String, Integer> SOURCE_MAX_CHARS = Map.ofEntries(
            Map.entry("PRODUCT:title", 255),
            Map.entry("PRODUCT:description", MAX_TEXT_CHARS),
            Map.entry("PRODUCT:seo_title", 255),
            Map.entry("PRODUCT:seo_description", 512),
            Map.entry("VARIANT:name", 128),
            Map.entry("TAG:name", 128),
            Map.entry("TAG:seo_title", 255),
            Map.entry("TAG:seo_description", 512),
            Map.entry("TAG:h1", 255),
            Map.entry("TAG:intro_text", TagUpsertRequest.INTRO_MAX_CHARS),
            Map.entry("PAYMENT_OPTION:title", 255),
            Map.entry("PAYMENT_OPTION:description", 1024),
            Map.entry("PAYMENT_REQUISITES:note", 2048),
            Map.entry("PAYMENT_REQUISITES:purpose", 255));

    private final ContentTranslationRepository repository;
    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final TagRepository tagRepository;
    private final PaymentOptionRepository paymentOptionRepository;
    private final PaymentRequisitesRepository requisitesRepository;
    private final TranslationService translationService;
    private final CacheManager cacheManager;

    public TranslationAdminService(ContentTranslationRepository repository,
                                   ProductRepository productRepository,
                                   ProductVariantRepository variantRepository,
                                   TagRepository tagRepository,
                                   PaymentOptionRepository paymentOptionRepository,
                                   PaymentRequisitesRepository requisitesRepository,
                                   TranslationService translationService,
                                   CacheManager cacheManager) {
        this.repository = repository;
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
        this.tagRepository = tagRepository;
        this.paymentOptionRepository = paymentOptionRepository;
        this.requisitesRepository = requisitesRepository;
        this.translationService = translationService;
        this.cacheManager = cacheManager;
    }

    // ------------------------------------------------------------------ export / stats

    @Transactional(readOnly = true)
    public List<ExportItem> export(String locale, String status, String entityType) {
        String l = requireLocale(locale);
        Status wanted = parseStatus(status);
        TranslationEntityType type = parseTypeOrNull(entityType);
        Map<Key, ContentTranslation> rows = existing(l);

        List<ExportItem> out = new ArrayList<>();
        for (Map.Entry<Key, Source> e : sources().entrySet()) {
            Key key = e.getKey();
            Source src = e.getValue();
            if (!src.inScope() || isBlank(src.text()) || (type != null && key.type() != type)) {
                continue;
            }
            String hash = TranslationService.sha256Hex(src.text());
            ContentTranslation row = rows.get(key);
            Status st = statusOf(row, hash);
            if (wanted != null && wanted != st) {
                continue;
            }
            out.add(new ExportItem(key.type().name(), key.entityId(), key.field(), src.text(), hash, st.name(),
                    row == null ? null : row.getText(),
                    row == null ? null : row.getOrigin().name(),
                    src.productId(), src.productTitle()));
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
        Map<Key, Source> sources = sources();
        Map<String, Map<String, Counts>> locales = new LinkedHashMap<>();
        for (String l : ContentLocale.TRANSLATED) {
            Map<Key, ContentTranslation> rows = existing(l);
            Map<String, int[]> acc = new LinkedHashMap<>();
            for (TranslationEntityType t : TranslationEntityType.values()) {
                acc.put(t.name(), new int[3]);
            }
            acc.put("ALL", new int[3]);
            for (Map.Entry<Key, Source> e : sources.entrySet()) {
                Source src = e.getValue();
                if (!src.inScope() || isBlank(src.text())) {
                    continue;
                }
                Status st = statusOf(rows.get(e.getKey()), TranslationService.sha256Hex(src.text()));
                acc.get(e.getKey().type().name())[st.ordinal()]++;
                acc.get("ALL")[st.ordinal()]++;
            }
            Map<String, Counts> counts = new LinkedHashMap<>();
            acc.forEach((k, v) -> counts.put(k, new Counts(v[0], v[1], v[2])));
            locales.put(l, counts);
        }
        return new Stats(locales);
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
            throw new BadRequestException("empty body");
        }
        String locale = requireLocale(req.locale());
        TranslationOrigin origin = parseOrigin(req.origin());
        boolean force = Boolean.TRUE.equals(req.force());
        List<ImportItem> items = req.items() == null ? List.of() : req.items();
        if (items.size() > MAX_ITEMS) {
            throw new BadRequestException("too many items (max " + MAX_ITEMS + ")");
        }

        Map<Key, Source> sources = sources();
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

            Source src = sources.get(key);
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
            String currentHash = hashCache.computeIfAbsent(src.text(), TranslationService::sha256Hex);
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
            row.setOrigin(origin);
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
            throw new BadRequestException("items required");
        }
        if (req.items().size() > MAX_FIX_ITEMS) {
            throw new BadRequestException("too many items (max " + MAX_FIX_ITEMS + ")");
        }
        String newSource = req.source();
        if (isBlank(newSource)) {
            throw new BadRequestException("source must not be blank");
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
                    throw new BadRequestException("translation " + l + " is too long");
                }
                translations.put(l, text);
            }
        }
        String newHash = TranslationService.sha256Hex(newSource);

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
                Integer max = SOURCE_MAX_CHARS.get(type.name() + ":" + ref.field());
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
                    row.setOrigin(TranslationOrigin.AI);
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

    /** OK | STALE | NOT_FOUND | INVALID_* - sets one source field when its hash still matches. */
    private String applySource(TranslationEntityType type, byte[] id, String field, String wantedHash,
                               String newSource, String newHash) {
        switch (type) {
            case PRODUCT -> {
                Product p = productRepository.findById(id).orElse(null);
                if (p == null) {
                    return "NOT_FOUND";
                }
                String current = switch (field) {
                    case TranslationEntityType.TITLE -> p.getTitle();
                    case TranslationEntityType.DESCRIPTION -> p.getDescription();
                    case TranslationEntityType.SEO_TITLE -> p.getSeoTitle();
                    default -> p.getSeoDescription();
                };
                if (!matches(current, wantedHash, newHash)) {
                    return "STALE";
                }
                switch (field) {
                    case TranslationEntityType.TITLE -> p.setTitle(newSource);
                    case TranslationEntityType.DESCRIPTION -> p.setDescription(newSource);
                    case TranslationEntityType.SEO_TITLE -> p.setSeoTitle(newSource);
                    default -> p.setSeoDescription(newSource);
                }
                return "OK";
            }
            case VARIANT -> {
                ProductVariant v = variantRepository.findById(id).orElse(null);
                if (v == null) {
                    return "NOT_FOUND";
                }
                if (!matches(v.getName(), wantedHash, newHash)) {
                    return "STALE";
                }
                v.setName(newSource);
                return "OK";
            }
            case TAG -> {
                Tag t = tagRepository.findById(id).orElse(null);
                if (t == null) {
                    return "NOT_FOUND";
                }
                if (!TranslationEntityType.NAME.equals(field)) {
                    if (!matches(tagSeoField(t, field), wantedHash, newHash)) {
                        return "STALE";
                    }
                    setTagSeoField(t, field, newSource);
                    return "OK";
                }
                if (!matches(t.getName(), wantedHash, newHash)) {
                    return "STALE";
                }
                Tag clash = tagRepository.findByName(newSource).orElse(null);
                if (clash != null && !Arrays.equals(clash.getId(), id)) {
                    return "INVALID_TAG_NAME_TAKEN";
                }
                t.setName(newSource);
                return "OK";
            }
            case PAYMENT_OPTION -> {
                PaymentOption o = paymentOptionRepository.findById(id).orElse(null);
                if (o == null) {
                    return "NOT_FOUND";
                }
                boolean title = TranslationEntityType.TITLE.equals(field);
                if (!matches(title ? o.getTitle() : o.getDescription(), wantedHash, newHash)) {
                    return "STALE";
                }
                if (title) {
                    o.setTitle(newSource);
                } else {
                    o.setDescription(newSource);
                }
                return "OK";
            }
            case PAYMENT_REQUISITES -> {
                PaymentRequisites r = TranslationEntityType.REQUISITES_ID.equals(UuidUtil.toString(id))
                        ? requisitesRepository.findById(1).orElse(null) : null;
                if (r == null) {
                    return "NOT_FOUND";
                }
                boolean note = TranslationEntityType.NOTE.equals(field);
                if (!matches(note ? r.getNote() : r.getPurpose(), wantedHash, newHash)) {
                    return "STALE";
                }
                if (note) {
                    r.setNote(newSource);
                } else {
                    r.setPurpose(newSource);
                }
                return "OK";
            }
            default -> {
                return "INVALID_ENTITY_TYPE";
            }
        }
    }

    /** The SEO source fields of a tag (everything translatable but the name). */
    static String tagSeoField(Tag t, String field) {
        return switch (field) {
            case TranslationEntityType.SEO_TITLE -> t.getSeoTitle();
            case TranslationEntityType.SEO_DESCRIPTION -> t.getSeoDescription();
            case TranslationEntityType.H1 -> t.getH1();
            case TranslationEntityType.INTRO_TEXT -> t.getIntroText();
            default -> throw new IllegalArgumentException("not a tag SEO field: " + field);
        };
    }

    private static void setTagSeoField(Tag t, String field, String value) {
        switch (field) {
            case TranslationEntityType.SEO_TITLE -> t.setSeoTitle(value);
            case TranslationEntityType.SEO_DESCRIPTION -> t.setSeoDescription(value);
            case TranslationEntityType.H1 -> t.setH1(value);
            case TranslationEntityType.INTRO_TEXT -> t.setIntroText(value);
            default -> throw new IllegalArgumentException("not a tag SEO field: " + field);
        }
    }

    /** The field still holds what the admin saw - or already holds the fix (a repeated click). */
    private static boolean matches(String current, String wantedHash, String newHash) {
        if (current == null) {
            return false;
        }
        String h = TranslationService.sha256Hex(current);
        return h.equals(wantedHash) || h.equals(newHash);
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
            throw new BadRequestException("field requires entityType and entityId");
        }
        TranslationEntityType type = parseTypeOrNull(entityType);
        int deleted;
        if (entityId != null && !entityId.isBlank()) {
            if (type == null) {
                throw new BadRequestException("entityId requires entityType");
            }
            byte[] id;
            try {
                id = UuidUtil.toBytes(entityId.trim());
            } catch (IllegalArgumentException e) {
                throw new BadRequestException("invalid entityId");
            }
            if (oneField) {
                if (!type.allows(field.trim())) {
                    throw new BadRequestException("field is not translatable for " + type.name());
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

    /** Rows whose entity no longer exists (no FKs on the shared table). Daily. */
    @Scheduled(cron = "${app.translations.orphan-cleanup-cron:0 50 4 * * *}")
    @Transactional
    public int cleanupOrphans() {
        int removed = repository.deleteOrphanProducts()
                + repository.deleteOrphanVariants()
                + repository.deleteOrphanTags()
                + repository.deleteOrphanPaymentOptions();
        if (removed > 0) {
            log.info("Removed {} orphaned content translation(s)", removed);
            invalidateAfterCommit();
        }
        return removed;
    }

    // ------------------------------------------------------------------ internals

    /** Every translatable field of every existing entity, with its current Russian source. */
    Map<Key, Source> sources() {
        Map<Key, Source> out = new HashMap<>();
        for (Object[] r : productRepository.translationSources()) {
            String id = UuidUtil.toString((byte[]) r[0]);
            boolean live = Boolean.TRUE.equals(r[5]) && !Boolean.TRUE.equals(r[6]);
            String title = (String) r[1];
            put(out, TranslationEntityType.PRODUCT, id, TranslationEntityType.TITLE, title, live, id, title);
            put(out, TranslationEntityType.PRODUCT, id, TranslationEntityType.DESCRIPTION, (String) r[2], live,
                    id, title);
            put(out, TranslationEntityType.PRODUCT, id, TranslationEntityType.SEO_TITLE, (String) r[3], live,
                    id, title);
            put(out, TranslationEntityType.PRODUCT, id, TranslationEntityType.SEO_DESCRIPTION, (String) r[4], live,
                    id, title);
        }
        for (Object[] r : variantRepository.translationSources()) {
            boolean live = Boolean.TRUE.equals(r[2]) && !Boolean.TRUE.equals(r[3]);
            String productId = r.length > 4 && r[4] != null ? UuidUtil.toString((byte[]) r[4]) : null;
            String productTitle = r.length > 5 ? (String) r[5] : null;
            put(out, TranslationEntityType.VARIANT, UuidUtil.toString((byte[]) r[0]), TranslationEntityType.NAME,
                    (String) r[1], live, productId, productTitle);
        }
        for (Tag t : tagRepository.findAll()) {
            String id = UuidUtil.toString(t.getId());
            put(out, TranslationEntityType.TAG, id, TranslationEntityType.NAME, t.getName(), true);
            // SEO fields carry the category name as context (productTitle; productId stays null),
            // so the «Переводы» screen and the AI prompt can tell whose page the text belongs to.
            for (String field : TranslationEntityType.TAG.fields()) {
                if (!TranslationEntityType.NAME.equals(field)) {
                    put(out, TranslationEntityType.TAG, id, field, tagSeoField(t, field), true, null, t.getName());
                }
            }
        }
        for (PaymentOption p : paymentOptionRepository.findAll()) {
            String id = UuidUtil.toString(p.getId());
            put(out, TranslationEntityType.PAYMENT_OPTION, id, TranslationEntityType.TITLE, p.getTitle(), p.isActive());
            put(out, TranslationEntityType.PAYMENT_OPTION, id, TranslationEntityType.DESCRIPTION, p.getDescription(),
                    p.isActive());
        }
        // The customer-facing texts of the shop requisites (card/IBAN themselves are not translated).
        requisitesRepository.findById(1).ifPresent(r -> {
            put(out, TranslationEntityType.PAYMENT_REQUISITES, TranslationEntityType.REQUISITES_ID,
                    TranslationEntityType.NOTE, r.getNote(), true);
            put(out, TranslationEntityType.PAYMENT_REQUISITES, TranslationEntityType.REQUISITES_ID,
                    TranslationEntityType.PURPOSE, r.getPurpose(), true);
        });
        return out;
    }

    private static void put(Map<Key, Source> out, TranslationEntityType type, String id, String field,
                            String text, boolean inScope) {
        out.put(new Key(type, id, field), new Source(text, inScope));
    }

    private static void put(Map<Key, Source> out, TranslationEntityType type, String id, String field,
                            String text, boolean inScope, String productId, String productTitle) {
        out.put(new Key(type, id, field), new Source(text, inScope, productId, productTitle));
    }

    private Map<Key, ContentTranslation> existing(String locale) {
        Map<Key, ContentTranslation> rows = new HashMap<>();
        for (ContentTranslation t : repository.findByLocale(locale)) {
            ContentTranslationId id = t.getId();
            rows.put(new Key(id.getEntityType(), UuidUtil.toString(id.getEntityId()), id.getField()), t);
        }
        return rows;
    }

    /**
     * The catalog caches embed translated text, so they go together with the snapshot — after the
     * commit, otherwise a request racing the transaction could re-cache the old rows for two minutes.
     */
    private void invalidateAfterCommit() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    invalidateNow();
                }
            });
        } else {
            invalidateNow();
        }
    }

    private void invalidateNow() {
        translationService.invalidate();
        for (String name : CATALOG_CACHES) {
            Cache cache = cacheManager.getCache(name);
            if (cache != null) {
                cache.clear();
            }
        }
    }

    static String requireLocale(String locale) {
        String l = locale == null ? "" : locale.trim().toLowerCase(Locale.ROOT);
        if (!ContentLocale.TRANSLATED.contains(l)) {
            throw new BadRequestException("locale must be one of " + ContentLocale.TRANSLATED);
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
            throw new BadRequestException("origin must be AI or MANUAL");
        }
    }

    private static Status parseStatus(String status) {
        if (status == null || status.isBlank() || "all".equalsIgnoreCase(status.trim())) {
            return null;
        }
        try {
            return Status.valueOf(status.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("status must be missing|stale|translated|all");
        }
    }

    private static TranslationEntityType parseTypeOrNull(String entityType) {
        if (entityType == null || entityType.isBlank()) {
            return null;
        }
        TranslationEntityType type = TranslationEntityType.parse(entityType);
        if (type == null) {
            throw new BadRequestException(
                    "entityType must be one of PRODUCT, VARIANT, TAG, PAYMENT_OPTION, PAYMENT_REQUISITES");
        }
        return type;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
