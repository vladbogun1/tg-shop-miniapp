package com.maxsolch.shop.service;

import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.catalog.CategoryRepository;
import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Map;
import java.util.function.Predicate;

/**
 * Human-readable URL slugs for the public site ({@code /product/<slug>}, {@code /catalog/<slug>}).
 *
 * <p>Titles are mostly Russian, some Ukrainian, plenty of Latin brand names. Cyrillic is
 * transliterated with the Ukrainian table when the text contains a letter only Ukrainian has
 * ({@code і ї є ґ}), otherwise with the Russian one — the two disagree on {@code г} and {@code и}
 * ("гарний" → "harnyi"-ish vs "игра" → "igra"), and picking per text gives the readable result
 * for both. The output is {@code [a-z0-9-]}, at most {@value #MAX_LENGTH} characters; collisions get
 * {@code -2}, {@code -3}… appended.
 *
 * <p>The pure functions are static so the Flyway Java migration that backfills existing rows
 * ({@code db.migration.V18_1__Backfill_slugs}) uses exactly the same rules as the admin edits.
 */
@Service
public class SlugService {

    public static final int MAX_LENGTH = 120;

    private static final Map<Character, String> RU = Map.ofEntries(
            Map.entry('а', "a"), Map.entry('б', "b"), Map.entry('в', "v"), Map.entry('г', "g"),
            Map.entry('д', "d"), Map.entry('е', "e"), Map.entry('ё', "e"), Map.entry('ж', "zh"),
            Map.entry('з', "z"), Map.entry('и', "i"), Map.entry('й', "y"), Map.entry('к', "k"),
            Map.entry('л', "l"), Map.entry('м', "m"), Map.entry('н', "n"), Map.entry('о', "o"),
            Map.entry('п', "p"), Map.entry('р', "r"), Map.entry('с', "s"), Map.entry('т', "t"),
            Map.entry('у', "u"), Map.entry('ф', "f"), Map.entry('х', "kh"), Map.entry('ц', "ts"),
            Map.entry('ч', "ch"), Map.entry('ш', "sh"), Map.entry('щ', "shch"), Map.entry('ъ', ""),
            Map.entry('ы', "y"), Map.entry('ь', ""), Map.entry('э', "e"), Map.entry('ю', "yu"),
            Map.entry('я', "ya"),
            // Ukrainian letters, in case one sneaks into an otherwise Russian title.
            Map.entry('і', "i"), Map.entry('ї', "yi"), Map.entry('є', "ye"), Map.entry('ґ', "g"));

    /** Ukrainian national transliteration (KMU 2010), word-initial forms used everywhere. */
    private static final Map<Character, String> UK = Map.ofEntries(
            Map.entry('а', "a"), Map.entry('б', "b"), Map.entry('в', "v"), Map.entry('г', "h"),
            Map.entry('ґ', "g"), Map.entry('д', "d"), Map.entry('е', "e"), Map.entry('є', "ye"),
            Map.entry('ж', "zh"), Map.entry('з', "z"), Map.entry('и', "y"), Map.entry('і', "i"),
            Map.entry('ї', "yi"), Map.entry('й', "y"), Map.entry('к', "k"), Map.entry('л', "l"),
            Map.entry('м', "m"), Map.entry('н', "n"), Map.entry('о', "o"), Map.entry('п', "p"),
            Map.entry('р', "r"), Map.entry('с', "s"), Map.entry('т', "t"), Map.entry('у', "u"),
            Map.entry('ф', "f"), Map.entry('х', "kh"), Map.entry('ц', "ts"), Map.entry('ч', "ch"),
            Map.entry('ш', "sh"), Map.entry('щ', "shch"), Map.entry('ь', ""), Map.entry('ю', "yu"),
            Map.entry('я', "ya"),
            // Russian-only letters inside a Ukrainian text.
            Map.entry('ё', "yo"), Map.entry('ъ', ""), Map.entry('ы', "y"), Map.entry('э', "e"));

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;

    public SlugService(ProductRepository productRepository, CategoryRepository categoryRepository) {
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
    }

    /**
     * Slug for a product: the admin's explicit value if given (normalised), else derived from the
     * title. Unique among products; {@code selfId} is the product being edited (null on create).
     */
    public String forProduct(String explicit, String title, byte[] selfId) {
        String base = baseOf(explicit, title, "product");
        return uniquify(base, s -> selfId == null
                ? productRepository.existsBySlug(s)
                : productRepository.existsBySlugAndIdNot(s, selfId));
    }

    /** Is this exact slug free for a product? Used to reject a hand-typed duplicate. */
    public boolean productSlugTaken(String slug, byte[] selfId) {
        return selfId == null
                ? productRepository.existsBySlug(slug)
                : productRepository.existsBySlugAndIdNot(slug, selfId);
    }

    /** Slug for a category; never the reserved {@code utsenka} (the virtual «Уценка» collection). */
    public String forCategory(String explicit, String name, byte[] selfId) {
        String base = baseOf(explicit, name, "category");
        return uniquify(base, s -> categorySlugTaken(s, selfId));
    }

    public boolean categorySlugTaken(String slug, byte[] selfId) {
        if (RESERVED_CATEGORY_SLUGS.contains(slug)) {
            return true;
        }
        return selfId == null
                ? categoryRepository.existsBySlug(slug)
                : categoryRepository.existsBySlugAndIdNot(slug, selfId);
    }

    /** Category slugs the site uses for something else. */
    public static final java.util.Set<String> RESERVED_CATEGORY_SLUGS = java.util.Set.of("utsenka");

    private static String baseOf(String explicit, String source, String fallback) {
        String fromExplicit = explicit == null ? "" : slugify(explicit);
        if (!fromExplicit.isEmpty()) {
            return fromExplicit;
        }
        String fromSource = slugify(source);
        return fromSource.isEmpty() ? fallback : fromSource;
    }

    // ------------------------------------------------------------------ pure functions

    /** Transliterates and normalises; may return an empty string (caller picks a fallback). */
    public static String slugify(String text) {
        if (text == null || text.isBlank()) {
            return "";
        }
        String lower = text.toLowerCase(Locale.ROOT);
        Map<Character, String> table = isUkrainian(lower) ? UK : RU;

        StringBuilder sb = new StringBuilder(lower.length() + 16);
        for (int i = 0; i < lower.length(); i++) {
            char c = lower.charAt(i);
            String mapped = table.get(c);
            if (mapped != null) {
                sb.append(mapped);
            } else if (c == '\'' || c == '’' || c == 'ʼ' || c == '`') {
                // Ukrainian apostrophe ("м'ята") is dropped, not turned into a word break.
                continue;
            } else if (c == '+') {
                sb.append("-plus-");
            } else if (c == '&') {
                sb.append("-and-");
            } else {
                sb.append(c);
            }
        }
        // Strip diacritics from Latin letters (é → e) before throwing the rest away.
        String ascii = Normalizer.normalize(sb, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        String slug = ascii.replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
        return truncate(slug, MAX_LENGTH);
    }

    /** {@code base}, or {@code base-2}, {@code base-3}… — the first one {@code taken} rejects not. */
    public static String uniquify(String base, Predicate<String> taken) {
        String root = base == null || base.isBlank() ? "item" : base;
        if (!taken.test(root)) {
            return root;
        }
        for (int n = 2; n < 100_000; n++) {
            String suffix = "-" + n;
            String candidate = truncate(root, MAX_LENGTH - suffix.length()) + suffix;
            if (!taken.test(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException("no free slug for " + root);
    }

    static boolean isUkrainian(String lower) {
        for (int i = 0; i < lower.length(); i++) {
            char c = lower.charAt(i);
            if (c == 'і' || c == 'ї' || c == 'є' || c == 'ґ') {
                return true;
            }
        }
        return false;
    }

    /** Cuts to {@code max}, preferring a word boundary, never leaving a trailing hyphen. */
    static String truncate(String slug, int max) {
        if (slug.length() <= max) {
            return slug;
        }
        String cut = slug.substring(0, max);
        int lastDash = cut.lastIndexOf('-');
        if (lastDash > max / 2) {
            cut = cut.substring(0, lastDash);
        }
        return cut.replaceAll("-+$", "");
    }
}
