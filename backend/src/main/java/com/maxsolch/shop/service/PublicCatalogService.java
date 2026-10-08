package com.maxsolch.shop.service;

import com.maxsolch.shop.catalog.CatalogDirectory;
import com.maxsolch.shop.catalog.CatalogSnapshot;
import com.maxsolch.shop.catalog.MarkdownCollection;
import com.maxsolch.shop.catalog.ProductCondition;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.translation.ContentLocale;
import com.maxsolch.shop.translation.TranslationEntityType;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.ProductDto;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.CategoryDetailDto;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.CategoryDto;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.ProductPage;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.SitemapCategory;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.SitemapDto;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.SitemapProduct;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Collator;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static com.maxsolch.shop.common.Texts.trimToNull;

/**
 * Catalog queries for the public site: filter / sort / paginate, product by slug, menu
 * categories with counts, sitemap.
 *
 * <p>Everything is computed over {@link CatalogService#listActiveProducts(String)} — the same
 * Caffeine cached list the Mini App reads (a couple of hundred products), one per content language.
 * Categories are a tree (catalog v2): a category filter covers its whole subtree; the virtual
 * {@code utsenka} collection is every product whose condition is not NEW.
 */
@Service
public class PublicCatalogService {

    public static final int MAX_PAGE_SIZE = 60;
    public static final int DEFAULT_PAGE_SIZE = 24;
    /** {@code all=1}: the whole selection for the site's own faceting. */
    public static final int MAX_ALL = 1000;

    private final CatalogService catalogService;
    private final CatalogDirectory catalogDirectory;
    private final ProductRepository productRepository;
    private final TranslationService translationService;
    private final MarkdownCollection markdown;

    public PublicCatalogService(CatalogService catalogService,
                                CatalogDirectory catalogDirectory,
                                ProductRepository productRepository,
                                TranslationService translationService,
                                MarkdownCollection markdown) {
        this.catalogService = catalogService;
        this.catalogDirectory = catalogDirectory;
        this.productRepository = productRepository;
        this.translationService = translationService;
        this.markdown = markdown;
    }

    /** Query parameters of {@code GET /api/public/products}; nulls mean "not set". */
    public record Query(String category, String q, Boolean inStock, Long priceMax, String sort,
                        Integer page, Integer size, Boolean all) {

        public Query(String category, String q, Boolean inStock, Long priceMax, String sort, Integer page,
                     Integer size) {
            this(category, q, inStock, priceMax, sort, page, size, null);
        }
    }

    public ProductPage search(Query query, String lang) {
        List<ProductDto> all = catalogService.listActiveProducts(lang);
        CatalogSnapshot catalog = catalogDirectory.snapshot();

        String category = trimToNull(query.category());
        boolean markdownOnly = MarkdownCollection.isSlug(category);
        Set<String> scope = null;
        if (category != null && !markdownOnly) {
            CatalogSnapshot.Cat c = catalog.categoryBySlug(category);
            if (c == null) {
                throw new NotFoundException("category not found");
            }
            scope = catalog.subtree(c.id());
        }
        String needle = trimToNull(query.q());
        String q = needle == null ? null : needle.toLowerCase(Locale.ROOT);
        Set<String> matching = q == null ? null : matchingIds(q);
        boolean inStockOnly = Boolean.TRUE.equals(query.inStock());

        // Everything except the price cap — that selection also gives the slider its upper bound.
        Set<String> inScope = scope;
        List<ProductDto> base = all.stream()
                .filter(p -> inScope == null || (p.categoryId() != null && inScope.contains(p.categoryId())))
                .filter(p -> !markdownOnly || isMarkdown(p))
                .filter(p -> matching == null || matching.contains(p.id()))
                .filter(p -> !inStockOnly || p.effectiveStock() > 0)
                .toList();
        long priceMaxAvailable = base.stream().mapToLong(ProductDto::priceMinor).max().orElse(0);

        Long priceMax = query.priceMax();
        List<ProductDto> filtered = base.stream()
                .filter(p -> priceMax == null || p.priceMinor() <= priceMax)
                .sorted(comparator(query.sort()))
                .toList();

        if (Boolean.TRUE.equals(query.all())) {
            List<ProductDto> items = filtered.size() > MAX_ALL ? filtered.subList(0, MAX_ALL) : filtered;
            return new ProductPage(items, filtered.size(), 0, MAX_ALL, priceMaxAvailable);
        }
        int size = query.size() == null ? DEFAULT_PAGE_SIZE : Math.max(1, Math.min(MAX_PAGE_SIZE, query.size()));
        int page = query.page() == null ? 0 : Math.max(0, query.page());
        long from = (long) page * size;
        List<ProductDto> items = from >= filtered.size()
                ? List.of()
                : filtered.subList((int) from, (int) Math.min(filtered.size(), from + size));
        return new ProductPage(items, filtered.size(), page, size, priceMaxAvailable);
    }

    static boolean isMarkdown(ProductDto p) {
        return p.condition() != null && !ProductCondition.NEW.name().equals(p.condition());
    }

    /**
     * Products whose title, description or brand contains {@code q} in the Russian source OR in any
     * current translation — «килимок» finds «Ковер» whatever language the page is in.
     */
    private Set<String> matchingIds(String q) {
        Set<String> ids = new HashSet<>();
        for (String lang : ContentLocale.ALL) {
            for (ProductDto p : catalogService.listActiveProducts(lang)) {
                if (matches(p, q)) {
                    ids.add(p.id());
                }
            }
        }
        return ids;
    }

    public Optional<ProductDto> bySlug(String slug, String lang) {
        if (slug == null || slug.isBlank()) {
            return Optional.empty();
        }
        String s = slug.trim().toLowerCase(Locale.ROOT);
        return catalogService.listActiveProducts(lang).stream()
                .filter(p -> s.equals(p.slug()))
                .findFirst();
    }

    /**
     * Menu categories ({@code showInMenu}, and the parent too), tree order, with subtree product
     * counts; the virtual «Уценка» last when it has products.
     */
    public List<CategoryDto> categories(String lang) {
        CatalogSnapshot catalog = catalogDirectory.snapshot();
        Map<String, Long> counts = subtreeCounts(catalog, lang);
        TranslationService.Overlay overlay = translationService.overlay(lang);
        List<CategoryDto> out = new ArrayList<>();
        for (CatalogSnapshot.Cat c : catalog.treeOrder()) {
            if (!inMenu(catalog, c)) {
                continue;
            }
            out.add(new CategoryDto(c.id(), c.slug(), name(overlay, c), c.sortOrder(),
                    counts.getOrDefault(c.id(), 0L), c.parentId(), c.artKind(), c.showInMenu()));
        }
        long markdownCount = markdownCount(lang);
        if (markdownCount > 0) {
            out.add(new CategoryDto(MarkdownCollection.ID, MarkdownCollection.SLUG, markdown.info(lang).name(),
                    MarkdownCollection.SORT_ORDER, markdownCount, null, MarkdownCollection.ART_KIND, true));
        }
        return out;
    }

    /**
     * One category by slug (in the menu or not) with the SEO of its page in the given language, or
     * the virtual «Уценка». Empty when there is no such slug.
     */
    public Optional<CategoryDetailDto> category(String slug, String lang) {
        if (slug == null || slug.isBlank()) {
            return Optional.empty();
        }
        String l = ContentLocale.normalize(lang);
        if (MarkdownCollection.isSlug(slug)) {
            MarkdownCollection.Info info = markdown.info(l);
            return Optional.of(new CategoryDetailDto(MarkdownCollection.ID, MarkdownCollection.SLUG, info.name(),
                    MarkdownCollection.SORT_ORDER, markdownCount(l), true, info.seoTitle(), info.seoDescription(),
                    info.h1(), info.introText(), null, MarkdownCollection.ART_KIND));
        }
        CatalogSnapshot catalog = catalogDirectory.snapshot();
        CatalogSnapshot.Cat c = catalog.categoryBySlug(slug);
        if (c == null) {
            return Optional.empty();
        }
        TranslationService.Overlay overlay = translationService.overlay(l);
        long count = subtreeCounts(catalog, l).getOrDefault(c.id(), 0L);
        boolean translated = ContentLocale.isTranslated(l);
        String seoTitle = translated ? seo(overlay, c, TranslationEntityType.SEO_TITLE, c.seoTitle()) : c.seoTitle();
        String seoDescription = translated
                ? seo(overlay, c, TranslationEntityType.SEO_DESCRIPTION, c.seoDescription()) : c.seoDescription();
        String h1 = translated ? seo(overlay, c, TranslationEntityType.H1, c.h1()) : c.h1();
        String intro = translated ? seo(overlay, c, TranslationEntityType.INTRO_TEXT, c.introText()) : c.introText();
        return Optional.of(new CategoryDetailDto(c.id(), c.slug(), name(overlay, c), c.sortOrder(), count,
                c.showInMenu(), seoTitle, seoDescription, h1, intro, c.parentId(), c.artKind()));
    }

    /**
     * SEO of a category page in a TRANSLATED language: the current translation or {@code null} —
     * never the Russian source (the site's own localized template is better than Russian text).
     */
    private static String seo(TranslationService.Overlay overlay, CatalogSnapshot.Cat c, String field, String source) {
        return overlay.translationOrNull(TranslationEntityType.CATEGORY, c.id(), field, source);
    }

    private static String name(TranslationService.Overlay overlay, CatalogSnapshot.Cat c) {
        return overlay.text(TranslationEntityType.CATEGORY, c.id(), TranslationEntityType.NAME, c.name());
    }

    private static boolean inMenu(CatalogSnapshot catalog, CatalogSnapshot.Cat c) {
        if (!c.showInMenu()) {
            return false;
        }
        CatalogSnapshot.Cat parent = catalog.category(c.parentId());
        return parent == null || parent.showInMenu();
    }

    /** Active products per category id, each counted in its category and every ancestor. */
    Map<String, Long> subtreeCounts(CatalogSnapshot catalog, String lang) {
        Map<String, Long> counts = new HashMap<>();
        for (ProductDto p : catalogService.listActiveProducts(lang)) {
            for (CatalogSnapshot.Cat c : catalog.path(p.categoryId())) {
                counts.merge(c.id(), 1L, Long::sum);
            }
        }
        return counts;
    }

    private long markdownCount(String lang) {
        return catalogService.listActiveProducts(lang).stream().filter(PublicCatalogService::isMarkdown).count();
    }

    /**
     * Products and menu categories (roots and children) for sitemap.xml. A category with no public
     * products in its subtree is left out (soft 404); its {@code updatedAt} is the newest change
     * among those products. {@code utsenka} is listed when it has products.
     */
    @Transactional(readOnly = true)
    public SitemapDto sitemap() {
        Map<String, Instant> updatedBySlug = new HashMap<>();
        List<SitemapProduct> products = productRepository.findAllActive().stream()
                .map(p -> {
                    Instant updated = p.getUpdatedAt() != null ? p.getUpdatedAt() : p.getCreatedAt();
                    if (p.getSlug() != null && updated != null) {
                        updatedBySlug.put(p.getSlug(), updated);
                    }
                    return new SitemapProduct(p.getSlug(), updated);
                })
                .toList();

        CatalogSnapshot catalog = catalogDirectory.snapshot();
        Set<String> nonEmpty = new HashSet<>();
        Map<String, Instant> lastChange = new HashMap<>();
        boolean anyMarkdown = false;
        Instant markdownChange = null;
        for (ProductDto p : catalogService.listActiveProducts(ContentLocale.RU)) {
            Instant updated = updatedBySlug.get(p.slug());
            for (CatalogSnapshot.Cat c : catalog.path(p.categoryId())) {
                nonEmpty.add(c.id());
                if (updated != null) {
                    lastChange.merge(c.id(), updated, (a, b) -> a.isAfter(b) ? a : b);
                }
            }
            if (isMarkdown(p)) {
                anyMarkdown = true;
                if (updated != null && (markdownChange == null || updated.isAfter(markdownChange))) {
                    markdownChange = updated;
                }
            }
        }
        List<SitemapCategory> categories = new ArrayList<>();
        for (CatalogSnapshot.Cat c : catalog.treeOrder()) {
            if (inMenu(catalog, c) && nonEmpty.contains(c.id())) {
                categories.add(new SitemapCategory(c.slug(), lastChange.get(c.id())));
            }
        }
        if (anyMarkdown) {
            categories.add(new SitemapCategory(MarkdownCollection.SLUG, markdownChange));
        }
        return new SitemapDto(products, categories);
    }

    // ------------------------------------------------------------------ internals

    private static boolean matches(ProductDto p, String q) {
        return (p.title() != null && p.title().toLowerCase(Locale.ROOT).contains(q))
                || (p.description() != null && p.description().toLowerCase(Locale.ROOT).contains(q))
                || (p.brandRef() != null && p.brandRef().name() != null
                        && p.brandRef().name().toLowerCase(Locale.ROOT).contains(q));
    }

    /**
     * Out-of-stock always sinks to the bottom (as in the Mini App), then the requested order.
     * {@code default} = best sellers first, then newest.
     */
    static Comparator<ProductDto> comparator(String sort) {
        Comparator<ProductDto> stockFirst = Comparator.comparingInt(p -> p.effectiveStock() > 0 ? 0 : 1);
        Comparator<ProductDto> newest = Comparator.comparing(ProductDto::createdAt,
                Comparator.nullsLast(Comparator.<Instant>reverseOrder()));
        Comparator<ProductDto> byId = Comparator.comparing(ProductDto::id);
        Comparator<ProductDto> order = switch (sort == null ? "default" : sort.trim().toLowerCase(Locale.ROOT)) {
            case "price_asc" -> Comparator.comparingLong(ProductDto::priceMinor).thenComparing(newest);
            case "price_desc" -> Comparator.comparingLong(ProductDto::priceMinor).reversed().thenComparing(newest);
            case "new" -> newest;
            case "name" -> Comparator.comparing(ProductDto::title, collator());
            default -> Comparator.comparingLong(ProductDto::soldCount).reversed().thenComparing(newest);
        };
        return stockFirst.thenComparing(order).thenComparing(byId);
    }

    private static Collator collator() {
        Collator c = Collator.getInstance(Locale.forLanguageTag("uk"));
        c.setStrength(Collator.SECONDARY);
        return c;
    }
}
