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
import org.springframework.stereotype.Component;

/**
 * What the translation use cases share: every translatable field with its current Russian source, the stored rows of a
 * language, the drop of in-memory translated text after a change, and the checks of a locale.
 */
@Component
class TranslationRows {

    private final ContentTranslationRepository repository;
    private final DomainEvents events;
    private final List<TranslatableSource> sourceList;

    TranslationRows(ContentTranslationRepository repository, DomainEvents events, List<TranslatableSource> sources) {
        this.repository = repository;
        this.events = events;
        this.sourceList = sources;
    }

    /** Every translatable field of every existing entity, with its current Russian source. */
    Map<Key, Field> sources() {
        Map<Key, Field> out = new HashMap<>();
        for (TranslatableSource s : sourceList) {
            out.putAll(s.fields());
        }
        return out;
    }


    Map<Key, ContentTranslation> existing(String locale) {
        Map<Key, ContentTranslation> rows = new HashMap<>();
        for (ContentTranslation t : repository.findByLocale(locale)) {
            ContentTranslationId id = t.getId();
            rows.put(new Key(id.getEntityType(), UuidUtil.toString(id.getEntityId()), id.getField()), t);
        }
        return rows;
    }

    /** Whoever keeps translated text in memory (snapshots, bot phrases, catalog caches) drops it after the commit. */
    void invalidate() {
        events.publish(new TranslationsChanged());
    }

    static String requireLocale(String locale) {
        String l = locale == null ? "" : locale.trim().toLowerCase(Locale.ROOT);
        if (!ContentLocale.TRANSLATED.contains(l)) {
            throw new DomainException.BadRequest(TranslationError.INVALID_LOCALE, String.valueOf(ContentLocale.TRANSLATED));
        }
        return l;
    }

    static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    static TranslationEntityType parseTypeOrNull(String entityType) {
        if (entityType == null || entityType.isBlank()) {
            return null;
        }
        TranslationEntityType type = TranslationEntityType.parse(entityType);
        if (type == null) {
            throw new DomainException.BadRequest(TranslationError.INVALID_ENTITY_TYPE);
        }
        return type;
    }

}
