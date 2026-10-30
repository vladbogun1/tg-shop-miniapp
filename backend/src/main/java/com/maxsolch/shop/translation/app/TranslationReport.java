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

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;

/**
 * The read side of the content translations (docs/CONTENT-I18N.md): the export of Russian sources with their hashes
 * and the translated / stale / missing counters. Writing is {@link TranslationImport}, {@link TranslationSourceFix}
 * and {@link TranslationAdminService}.
 */
@Service
public class TranslationReport {

    private final TranslationRows store;
    private final BotTexts botTexts;

    TranslationReport(TranslationRows store, BotTexts botTexts) {
        this.store = store;
        this.botTexts = botTexts;
    }

    @Transactional(readOnly = true)
    public List<ExportItem> export(String locale, String status, String entityType) {
        String l = TranslationRows.requireLocale(locale);
        Status wanted = parseStatus(status);
        TranslationEntityType type = TranslationRows.parseTypeOrNull(entityType);
        Map<Key, ContentTranslation> rows = withBuiltinBotTexts(store.existing(l), l);

        List<ExportItem> out = new ArrayList<>();
        for (Map.Entry<Key, Field> e : store.sources().entrySet()) {
            Key key = e.getKey();
            Field src = e.getValue();
            if (!src.inScope() || TranslationRows.isBlank(src.text()) || (type != null && key.type() != type)) {
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
        Map<Key, Field> sources = store.sources();
        Map<String, Map<String, Counts>> locales = new LinkedHashMap<>();
        // Bucket of every unique source text: 0 missing, 1 stale, 2 review, 3 done (lowest wins).
        Map<String, Integer> textBucket = new HashMap<>();
        Map<String, String> hashes = new HashMap<>();
        for (String l : ContentLocale.TRANSLATED) {
            Map<Key, ContentTranslation> rows = withBuiltinBotTexts(store.existing(l), l);
            Map<String, int[]> acc = new LinkedHashMap<>();
            for (TranslationEntityType t : TranslationEntityType.values()) {
                if (t.translatable()) {
                    acc.put(t.name(), new int[4]);
                }
            }
            acc.put("ALL", new int[4]);
            for (Map.Entry<Key, Field> e : sources.entrySet()) {
                Field src = e.getValue();
                if (!src.inScope() || TranslationRows.isBlank(src.text())) {
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
    private static Status parseStatus(String status) {
        if (status == null || status.isBlank() || "all".equalsIgnoreCase(status.trim())) {
            return null;
        }
        try {
            return Status.valueOf(status.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest(TranslationError.INVALID_STATUS);
        }
    }

}
