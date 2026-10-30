package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.ProductCondition;
import com.maxsolch.shop.translation.domain.ContentLocale;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.translation.app.TranslationService;
import org.springframework.stereotype.Component;

/**
 * The virtual «Уценка» collection ({@code /catalog/utsenka}): all products with condition ≠ NEW.
 * Its name and SEO come from the legacy {@code utsenka} tag (V52 keeps the tags table and its TAG
 * translations), else from fixed labels — the site then uses its templates.
 */
@Component
public class MarkdownCollection {

    public static final String SLUG = "utsenka";
    public static final String ID = "utsenka";
    public static final String ART_KIND = "sale";
    /** After every real category. */
    public static final int SORT_ORDER = 1_000_000;

    public record Info(String name, String seoTitle, String seoDescription, String h1, String introText) {
    }

    private final MarkdownTagQueries tags;
    private final TranslationService translationService;

    public MarkdownCollection(MarkdownTagQueries tags, TranslationService translationService) {
        this.tags = tags;
        this.translationService = translationService;
    }

    public static boolean isSlug(String slug) {
        return slug != null && SLUG.equalsIgnoreCase(slug.trim());
    }

    /** Name + SEO in a content language; SEO fields null = the site's template. */
    public Info info(String lang) {
        String l = ContentLocale.normalize(lang);
        MarkdownTagQueries.Row row = tags.bySlug(SLUG);
        String fallback = ProductCondition.MARKDOWN.label(l);
        if (row == null) {
            return new Info(fallback, null, null, null, null);
        }
        if (!ContentLocale.isTranslated(l)) {
            return new Info(row.name() == null ? fallback : row.name(), row.seoTitle(), row.seoDescription(), row.h1(),
                    row.introText());
        }
        TranslationService.Overlay o = translationService.overlay(l);
        String name = o.translationOrNull(TranslationEntityType.TAG, row.id(), TranslationEntityType.NAME, row.name());
        return new Info(name == null ? fallback : name,
                o.translationOrNull(TranslationEntityType.TAG, row.id(), TranslationEntityType.SEO_TITLE, row.seoTitle()),
                o.translationOrNull(TranslationEntityType.TAG, row.id(), TranslationEntityType.SEO_DESCRIPTION,
                        row.seoDescription()),
                o.translationOrNull(TranslationEntityType.TAG, row.id(), TranslationEntityType.H1, row.h1()),
                o.translationOrNull(TranslationEntityType.TAG, row.id(), TranslationEntityType.INTRO_TEXT,
                        row.introText()));
    }
}
