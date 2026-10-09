package com.maxsolch.shop.catalog;

import com.maxsolch.shop.common.UuidUtil;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Loads the {@link CatalogSnapshot} (cached in {@code catalogSchema}) and evicts every catalog cache
 * after a schema/category/brand change.
 */
@Component
public class CatalogDirectory {

    /** Everything that embeds categories, brands or attributes. */
    public static final List<String> CACHES = List.of("catalogSchema", "products", "productById");

    private final CategoryRepository categoryRepository;
    private final BrandRepository brandRepository;
    private final SpecGroupRepository groupRepository;
    private final SpecAttributeRepository attributeRepository;
    private final SpecOptionRepository optionRepository;
    private final CacheManager cacheManager;

    public CatalogDirectory(CategoryRepository categoryRepository, BrandRepository brandRepository,
                            SpecGroupRepository groupRepository, SpecAttributeRepository attributeRepository,
                            SpecOptionRepository optionRepository, CacheManager cacheManager) {
        this.categoryRepository = categoryRepository;
        this.brandRepository = brandRepository;
        this.groupRepository = groupRepository;
        this.attributeRepository = attributeRepository;
        this.optionRepository = optionRepository;
        this.cacheManager = cacheManager;
    }

    @Transactional(readOnly = true)
    @Cacheable(value = "catalogSchema", key = "'snapshot'")
    public CatalogSnapshot snapshot() {
        return load();
    }

    /** Uncached read (inside a write transaction that must see its own changes). */
    @Transactional(readOnly = true)
    public CatalogSnapshot load() {
        List<CatalogSnapshot.Cat> cats = categoryRepository.findAll().stream().map(CatalogDirectory::cat).toList();
        List<CatalogSnapshot.BrandInfo> brands = brandRepository.findAll().stream()
                .map(b -> new CatalogSnapshot.BrandInfo(UuidUtil.toString(b.getId()), b.getName(), b.getSlug(),
                        b.aliasList(), b.getWebsite(), b.getSortOrder(), b.getLogoUrl(), b.getLogoMode()))
                .toList();
        List<CatalogSnapshot.Group> groups = groupRepository.findAll().stream()
                .map(g -> new CatalogSnapshot.Group(g.getKey(), g.getLabelRu(), g.getLabelUk(), g.getLabelEn(),
                        g.getSortOrder()))
                .toList();
        Map<String, List<CatalogSnapshot.Option>> options = new HashMap<>();
        for (SpecOption o : optionRepository.findAll()) {
            options.computeIfAbsent(UuidUtil.toString(o.getAttributeId()), k -> new ArrayList<>())
                    .add(option(o));
        }
        List<CatalogSnapshot.Attr> attrs = attributeRepository.findAll().stream()
                .map(a -> attr(a, options.getOrDefault(UuidUtil.toString(a.getId()), List.of())))
                .toList();
        return new CatalogSnapshot(cats, brands, groups, attrs);
    }

    static CatalogSnapshot.Cat cat(Category c) {
        return new CatalogSnapshot.Cat(UuidUtil.toString(c.getId()),
                c.getParentId() == null ? null : UuidUtil.toString(c.getParentId()),
                c.getName(), c.getSlug(), c.getSortOrder(), c.isShowInMenu(), c.getArtKind(), c.getSeoTitle(),
                c.getSeoDescription(), c.getH1(), c.getIntroText());
    }

    static CatalogSnapshot.Option option(SpecOption o) {
        return new CatalogSnapshot.Option(o.getValue(), o.getLabelRu(), o.getLabelUk(), o.getLabelEn(),
                o.aliasList(), o.getSortOrder());
    }

    public static CatalogSnapshot.Attr attr(SpecAttribute a, List<CatalogSnapshot.Option> options) {
        List<CatalogSnapshot.Option> sorted = options.stream()
                .sorted(java.util.Comparator.comparingInt(CatalogSnapshot.Option::sort)
                        .thenComparing(CatalogSnapshot.Option::value))
                .toList();
        return new CatalogSnapshot.Attr(UuidUtil.toString(a.getId()),
                a.getCategoryId() == null ? null : UuidUtil.toString(a.getCategoryId()),
                a.getKey(), a.getLabelRu(), a.getLabelUk(), a.getLabelEn(), a.getType(), a.getUnitRu(),
                a.getUnitUk(), a.getUnitEn(), a.isRange(), a.getGroupKey(), a.isFilterable(), a.isComparable(),
                a.isRequired(), a.isHighlight(), a.getSortOrder(), buckets(a.getBucketsJson()), a.getHint(), sorted);
    }

    /** Buckets JSON {@code [{min,max,label_ru,label_uk,label_en}]} → buckets with ids; null when none. */
    public static List<CatalogSnapshot.Bucket> buckets(String json) {
        List<Map<String, Object>> raw = SpecsJson.readList(json);
        if (raw.isEmpty()) {
            return null;
        }
        List<CatalogSnapshot.Bucket> out = new ArrayList<>();
        for (Map<String, Object> b : raw) {
            Double min = num(b.get("min"));
            Double max = num(b.get("max"));
            String ru = str(b.get("label_ru"));
            out.add(new CatalogSnapshot.Bucket(CatalogSnapshot.bucketId(min, max), min, max, ru,
                    str(b.get("label_uk")), str(b.get("label_en"))));
        }
        return out;
    }

    private static Double num(Object o) {
        return o instanceof Number n ? n.doubleValue() : null;
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }

    /** Drops the catalog caches — after the commit when inside a transaction. */
    public void evictAll() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    clear();
                }
            });
        } else {
            clear();
        }
    }

    private void clear() {
        for (String name : CACHES) {
            Cache cache = cacheManager.getCache(name);
            if (cache != null) {
                cache.clear();
            }
        }
    }
}
