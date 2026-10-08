package com.maxsolch.shop.translation;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.ProductVariantRepository;
import com.maxsolch.shop.web.dto.PaymentOptionDto;
import com.maxsolch.shop.web.dto.ProductDto;
import com.maxsolch.shop.web.dto.ProductVariantDto;
import com.maxsolch.shop.web.dto.TagDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

/**
 * Read side of the content translations (docs/CONTENT-I18N.md).
 *
 * <p>All rows of a language are loaded with one query and kept in memory for a minute (the catalog
 * is a couple of hundred products, a few thousand rows at most); imports and deletes drop the
 * snapshot at once. The snapshot only holds translations — whether one APPLIES is decided at overlay
 * time against the current Russian source, so an admin edit of a product needs no invalidation here:
 * the hash stops matching and the original shows up as soon as the catalog cache is rebuilt (which
 * the edit already evicts).
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
    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;

    private final Cache<String, Map<Key, Entry>> snapshots = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofSeconds(60))
            .maximumSize(8)
            .build();

    public TranslationService(ContentTranslationRepository repository,
                              ProductRepository productRepository,
                              ProductVariantRepository variantRepository) {
        this.repository = repository;
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
    }

    // ------------------------------------------------------------------ hashing

    /** SHA-256, hex, lower case, of the exact UTF-8 bytes of the source as stored (no trim). */
    public static String sha256Hex(String source) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(source.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    // ------------------------------------------------------------------ snapshot

    /** All translations of a language, keyed by field. Empty for ru / unknown languages. */
    public Map<Key, Entry> snapshot(String lang) {
        String l = ContentLocale.normalize(lang);
        if (!ContentLocale.isTranslated(l)) {
            return Map.of();
        }
        return snapshots.get(l, this::load);
    }

    /** Drops the in-memory snapshots (after an import, a delete or an orphan sweep). */
    public void invalidate() {
        snapshots.invalidateAll();
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

    // ------------------------------------------------------------------ customer orders

    /**
     * Translated names for the lines of a customer's order: product id → title, variant id → name,
     * only where the product/variant still exists and its translation is current. Callers fall back
     * to the Russian snapshot ({@code order_items.title_snapshot} stays Russian for the seller).
     */
    @Transactional(readOnly = true)
    public ItemNames orderItemNames(Collection<byte[]> productIds, Collection<byte[]> variantIds, String lang) {
        Overlay overlay = overlay(lang);
        if (!overlay.active()) {
            return ItemNames.EMPTY;
        }
        Map<String, String> titles = new HashMap<>();
        if (!productIds.isEmpty()) {
            for (Object[] row : productRepository.titlesByIds(distinct(productIds))) {
                String id = UuidUtil.toString((byte[]) row[0]);
                String source = (String) row[1];
                String text = overlay.text(TranslationEntityType.PRODUCT, id, TranslationEntityType.TITLE, source);
                if (text != null && !text.equals(source)) {
                    titles.put(id, text);
                }
            }
        }
        Map<String, String> variants = new HashMap<>();
        if (!variantIds.isEmpty()) {
            for (Object[] row : variantRepository.namesByIds(distinct(variantIds))) {
                String id = UuidUtil.toString((byte[]) row[0]);
                String source = (String) row[1];
                String text = overlay.text(TranslationEntityType.VARIANT, id, TranslationEntityType.NAME, source);
                if (text != null && !text.equals(source)) {
                    variants.put(id, text);
                }
            }
        }
        return new ItemNames(titles, variants);
    }

    private static List<byte[]> distinct(Collection<byte[]> ids) {
        Map<String, byte[]> unique = new HashMap<>();
        for (byte[] id : ids) {
            if (id != null) {
                unique.putIfAbsent(UuidUtil.toString(id), id);
            }
        }
        return new ArrayList<>(unique.values());
    }

    /** Translated order-line names; absent key = show the snapshot. */
    public record ItemNames(Map<String, String> productTitles, Map<String, String> variantNames) {
        public static final ItemNames EMPTY = new ItemNames(Map.of(), Map.of());

        public String title(String productId, String snapshot) {
            return productId == null ? snapshot : productTitles.getOrDefault(productId, snapshot);
        }

        public String variant(String variantId, String snapshot) {
            return variantId == null ? snapshot : variantNames.getOrDefault(variantId, snapshot);
        }
    }

    // ------------------------------------------------------------------ overlay

    /**
     * Applies one language's translations to DTOs. A translation replaces the source only when its
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
            if (e == null || !e.sourceHash().equals(sha256Hex(source))) {
                return source;
            }
            return e.text();
        }

        public ProductDto product(ProductDto p) {
            if (!active() || p == null) {
                return p;
            }
            String id = p.id();
            List<ProductVariantDto> variants = p.variants() == null ? null : p.variants().stream()
                    .map(v -> new ProductVariantDto(v.id(),
                            text(TranslationEntityType.VARIANT, v.id(), TranslationEntityType.NAME, v.name()),
                            v.stock(), v.sortOrder()))
                    .toList();
            List<TagDto> tags = p.tags() == null ? null : p.tags().stream().map(this::tag).toList();
            return new ProductDto(
                    id,
                    text(TranslationEntityType.PRODUCT, id, TranslationEntityType.TITLE, p.title()),
                    text(TranslationEntityType.PRODUCT, id, TranslationEntityType.DESCRIPTION, p.description()),
                    p.priceMinor(),
                    p.currency(),
                    p.stock(),
                    p.active(),
                    p.soldCount(),
                    p.images(),
                    variants,
                    tags,
                    p.slug(),
                    p.compareAtMinor(),
                    text(TranslationEntityType.PRODUCT, id, TranslationEntityType.SEO_TITLE, p.seoTitle()),
                    text(TranslationEntityType.PRODUCT, id, TranslationEntityType.SEO_DESCRIPTION, p.seoDescription()),
                    p.createdAt(),
                    p.brand(),
                    p.sku(),
                    p.ratingAvg(),
                    p.ratingCount(),
                    p.categoryId(),
                    p.brandRef(),
                    p.condition(),
                    text(TranslationEntityType.PRODUCT, id, TranslationEntityType.CONDITION_NOTE, p.conditionNote()),
                    p.specs());
        }

        public List<ProductDto> products(List<ProductDto> list) {
            return active() ? list.stream().map(this::product).toList() : list;
        }

        public TagDto tag(TagDto t) {
            if (!active() || t == null) {
                return t;
            }
            return new TagDto(t.id(), text(TranslationEntityType.CATEGORY, t.id(), TranslationEntityType.NAME, t.name()),
                    t.slug(), t.sortOrder(), t.showInMenu());
        }

        /** The current translation of a field, or {@code null} when there is none (or it is stale). */
        public String translationOrNull(TranslationEntityType type, String entityId, String field, String source) {
            if (source == null || entityId == null || rows.isEmpty()) {
                return null;
            }
            Entry e = rows.get(new Key(type, entityId, field));
            return e != null && e.sourceHash().equals(sha256Hex(source)) ? e.text() : null;
        }

        public List<TagDto> tags(List<TagDto> list) {
            return active() ? list.stream().map(this::tag).toList() : list;
        }

        public PaymentOptionDto paymentOption(PaymentOptionDto p) {
            if (!active() || p == null) {
                return p;
            }
            return new PaymentOptionDto(p.id(),
                    text(TranslationEntityType.PAYMENT_OPTION, p.id(), TranslationEntityType.TITLE, p.title()),
                    text(TranslationEntityType.PAYMENT_OPTION, p.id(), TranslationEntityType.DESCRIPTION, p.description()),
                    p.requiresPrepayment(), p.prepaymentMinor());
        }
    }
}
