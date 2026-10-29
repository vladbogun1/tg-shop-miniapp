package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.platform.cache.CacheConfig;
import com.maxsolch.shop.platform.tx.OnCommitted;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.translation.domain.ContentLocale;
import com.maxsolch.shop.translation.domain.ContentTranslation;
import com.maxsolch.shop.translation.domain.ContentTranslationId;
import com.maxsolch.shop.translation.domain.SourceHash;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.translation.domain.TranslationOrigin;
import com.maxsolch.shop.translation.domain.TranslationsChanged;
import com.maxsolch.shop.translation.infra.ContentTranslationRepository;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Read side of the content translations (docs/CONTENT-I18N.md). Knows nothing about products or payment
 * methods: the modules that own the texts apply the {@link Overlay} to their own read models.
 *
 * <p>All rows of a language are loaded with one query and kept in the {@link CacheConfig#TRANSLATION_SNAPSHOTS}
 * cache for a minute (the catalog is a couple of hundred products, a few thousand rows at most); imports and
 * deletes drop the snapshot at once ({@link TranslationsChanged}). The snapshot only holds translations — whether
 * one APPLIES is decided at overlay time against the current Russian source, so an admin edit of a product needs
 * no invalidation here: the hash stops matching and the original shows up as soon as the catalog cache is rebuilt
 * (which the edit already evicts).
 */
@Service
public class TranslationService {

    /** Identifies one translatable field. {@code entityId} is the canonical (lower case) UUID string. */
    public record Key(TranslationEntityType type, String entityId, String field) {
    }

    /** A stored translation, detached from JPA. */
    public record Entry(String text, String sourceHash, TranslationOrigin origin) {
    }

    private static final Overlay NONE = new Overlay(Map.of());

    private final ContentTranslationRepository repository;
    private final CacheManager cacheManager;

    public TranslationService(ContentTranslationRepository repository, CacheManager cacheManager) {
        this.repository = repository;
        this.cacheManager = cacheManager;
    }

    // ------------------------------------------------------------------ snapshot

    /** All translations of a language, keyed by field. Empty for ru / unknown languages. */
    @SuppressWarnings("unchecked")
    public Map<Key, Entry> snapshot(String lang) {
        String l = ContentLocale.normalize(lang);
        if (!ContentLocale.isTranslated(l)) {
            return Map.of();
        }
        Cache cache = cacheManager.getCache(CacheConfig.TRANSLATION_SNAPSHOTS);
        if (cache == null) {
            return load(l);
        }
        return cache.get(l, () -> load(l));
    }

    /** Drops the in-memory snapshots (after an import, a delete or an orphan sweep). */
    public void invalidate() {
        Cache cache = cacheManager.getCache(CacheConfig.TRANSLATION_SNAPSHOTS);
        if (cache != null) {
            cache.clear();
        }
    }

    /** After the commit of whoever changed the stored translations. */
    @OnCommitted
    public void onTranslationsChanged(TranslationsChanged event) {
        invalidate();
    }

    private Map<Key, Entry> load(String locale) {
        Map<Key, Entry> map = new HashMap<>();
        for (ContentTranslation t : repository.findByLocale(locale)) {
            ContentTranslationId id = t.getId();
            map.put(new Key(id.getEntityType(), UuidUtil.toString(id.getEntityId()), id.getField()),
                    new Entry(t.getText(), t.getSourceHash(), t.getOrigin()));
        }
        return Map.copyOf(map);
    }

    public Overlay overlay(String lang) {
        Map<Key, Entry> rows = snapshot(lang);
        return rows.isEmpty() ? NONE : new Overlay(rows);
    }

    /** Removes every translation of entities that were hard-deleted (a category, removed variants). */
    @Transactional
    public void deleteForEntities(TranslationEntityType type, Collection<byte[]> entityIds) {
        List<byte[]> ids = distinct(entityIds);
        if (ids.isEmpty()) {
            return;
        }
        if (repository.deleteForEntities(type, ids) > 0) {
            invalidate();
        }
    }

    /** Distinct non-null ids (by canonical UUID string). */
    public static List<byte[]> distinct(Collection<byte[]> ids) {
        Map<String, byte[]> unique = new HashMap<>();
        for (byte[] id : ids) {
            if (id != null) {
                unique.putIfAbsent(UuidUtil.toString(id), id);
            }
        }
        return new ArrayList<>(unique.values());
    }

    // ------------------------------------------------------------------ overlay

    /**
     * Applies one language's translations to texts. A translation replaces the source only when its
     * {@code sourceHash} equals the hash of the CURRENT source: a stale text is never shown (product
     * descriptions carry prices and specs).
     */
    public static final class Overlay {

        private final Map<Key, Entry> rows;

        public Overlay(Map<Key, Entry> rows) {
            this.rows = rows;
        }

        public boolean active() {
            return !rows.isEmpty();
        }

        public String text(TranslationEntityType type, String entityId, String field, String source) {
            if (source == null || entityId == null || rows.isEmpty()) {
                return source;
            }
            Entry e = rows.get(new Key(type, entityId, field));
            if (e == null || !e.sourceHash().equals(SourceHash.sha256Hex(source))) {
                return source;
            }
            return e.text();
        }

        /** The current translation of a field, or {@code null} when there is none (or it is stale). */
        public String translationOrNull(TranslationEntityType type, String entityId, String field, String source) {
            if (source == null || entityId == null || rows.isEmpty()) {
                return null;
            }
            Entry e = rows.get(new Key(type, entityId, field));
            return e != null && e.sourceHash().equals(SourceHash.sha256Hex(source)) ? e.text() : null;
        }
    }
}
