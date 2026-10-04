package com.maxsolch.shop.service;

import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.TagRepository;
import com.maxsolch.shop.translation.ContentLocale;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.ProductDto;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.CategoryDto;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.ProductPage;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.SitemapCategory;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.SitemapDto;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.SitemapProduct;
import com.maxsolch.shop.web.dto.TagDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Collator;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Catalog queries for the public site: filter / sort / paginate, product by slug, menu
 * categories with counts, sitemap.
 *
 * <p>Everything is computed over {@link CatalogService#listActiveProducts(String)} — the same
 * Caffeine cached list the Mini App reads (a couple of hundred products), one per content language.
 * Filtering that in memory is cheaper than any query and, importantly, the admin's cache evictions
 * keep both apps in step.
 */
@Service
public class PublicCatalogService {

    public static final int MAX_PAGE_SIZE = 60;
    public static final int DEFAULT_PAGE_SIZE = 24;

    private final CatalogService catalogService;
    private final TagRepository tagRepository;
    private final ProductRepository productRepository;

    public PublicCatalogService(CatalogService catalogService,
                                TagRepository tagRepository,
                                ProductRepository productRepository) {
        this.catalogService = catalogService;
        this.tagRepository = tagRepository;
        this.productRepository = productRepository;
    }

    /** Query parameters of {@code GET /api/public/products}; nulls mean "not set". */
    public record Query(String category, String q, Boolean inStock, Long priceMax, String sort,
                        Integer page, Integer size) {
    }

    public ProductPage search(Query query, String lang) {
        List<ProductDto> all = catalogService.listActiveProducts(lang);

        String category = blankToNull(query.category());
        if (category != null && catalogService.listTags(lang).stream().noneMatch(t -> category.equals(t.slug()))) {
            throw new NotFoundException("category not found");
        }
        String needle = blankToNull(query.q());
        String q = needle == null ? null : needle.toLowerCase(Locale.ROOT);
        Set<String> matching = q == null ? null : matchingIds(q);
        boolean inStockOnly = Boolean.TRUE.equals(query.inStock());

        // Everything except the price cap — that selection also gives the slider its upper bound.
        List<ProductDto> base = all.stream()
                .filter(p -> category == null || hasTag(p, category))
                .filter(p -> matching == null || matching.contains(p.id()))
                .filter(p -> !inStockOnly || p.effectiveStock() > 0)
                .toList();
        long priceMaxAvailable = base.stream().mapToLong(ProductDto::priceMinor).max().orElse(0);

        Long priceMax = query.priceMax();
        List<ProductDto> filtered = base.stream()
                .filter(p -> priceMax == null || p.priceMinor() <= priceMax)
                .sorted(comparator(query.sort()))
                .toList();

        int size = query.size() == null ? DEFAULT_PAGE_SIZE : Math.max(1, Math.min(MAX_PAGE_SIZE, query.size()));
        int page = query.page() == null ? 0 : Math.max(0, query.page());
        long from = (long) page * size;
        List<ProductDto> items = from >= filtered.size()
                ? List.of()
                : filtered.subList((int) from, (int) Math.min(filtered.size(), from + size));
        return new ProductPage(items, filtered.size(), page, size, priceMaxAvailable);
    }

    /**
     * Products whose title or description contains {@code q} in the Russian source OR in any current
     * translation — «килимок» finds «Ковер» whatever language the page is in. Each language's list
     * is already cached, so this is three in-memory scans.
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

    /** Menu categories ({@code showInMenu}), by sortOrder then name, with live product counts. */
    public List<CategoryDto> categories(String lang) {
        Map<String, Long> counts = new HashMap<>();
        for (ProductDto p : catalogService.listActiveProducts(lang)) {
            if (p.tags() == null) {
                continue;
            }
            for (TagDto t : p.tags()) {
                counts.merge(t.id(), 1L, Long::sum);
            }
        }
        Collator collator = collator();
        return catalogService.listTags(lang).stream()
                .filter(TagDto::showInMenu)
                .sorted(Comparator.comparingInt(TagDto::sortOrder)
                        .thenComparing(TagDto::name, collator))
                .map(t -> new CategoryDto(t.id(), t.slug(), t.name(), t.sortOrder(),
                        counts.getOrDefault(t.id(), 0L)))
                .toList();
    }

    /**
     * Products and menu categories for sitemap.xml. A category with no public products is left out:
     * it renders an empty list (the site marks it {@code noindex}), i.e. a soft 404 for search
     * engines. A category's {@code updatedAt} is the newest change among its products.
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

        // Same product set and tag membership as categories() — the cached public DTOs.
        Set<String> nonEmpty = new HashSet<>();
        Map<String, Instant> lastChange = new HashMap<>();
        for (ProductDto p : catalogService.listActiveProducts(ContentLocale.RU)) {
            if (p.tags() == null) {
                continue;
            }
            Instant updated = updatedBySlug.get(p.slug());
            for (TagDto t : p.tags()) {
                if (t.slug() == null) {
                    continue;
                }
                nonEmpty.add(t.slug());
                if (updated != null) {
                    lastChange.merge(t.slug(), updated, (a, b) -> a.isAfter(b) ? a : b);
                }
            }
        }
        List<SitemapCategory> categories = tagRepository.findAllByOrderByNameAsc().stream()
                .filter(t -> t.isShowInMenu())
                .filter(t -> nonEmpty.contains(t.getSlug()))
                .map(t -> new SitemapCategory(t.getSlug(), lastChange.get(t.getSlug())))
                .toList();
        return new SitemapDto(products, categories);
    }

    // ------------------------------------------------------------------ internals

    private static boolean hasTag(ProductDto p, String slug) {
        return p.tags() != null && p.tags().stream().anyMatch(t -> slug.equals(t.slug()));
    }

    private static boolean matches(ProductDto p, String q) {
        return (p.title() != null && p.title().toLowerCase(Locale.ROOT).contains(q))
                || (p.description() != null && p.description().toLowerCase(Locale.ROOT).contains(q));
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

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
