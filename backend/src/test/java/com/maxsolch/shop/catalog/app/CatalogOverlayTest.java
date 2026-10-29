package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.translation.app.TranslationService.Entry;
import com.maxsolch.shop.translation.app.TranslationService.Key;
import com.maxsolch.shop.translation.app.TranslationService.Overlay;
import com.maxsolch.shop.translation.domain.SourceHash;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.translation.domain.TranslationOrigin;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static com.maxsolch.shop.translation.domain.TranslationEntityType.DESCRIPTION;
import static com.maxsolch.shop.translation.domain.TranslationEntityType.NAME;
import static com.maxsolch.shop.translation.domain.TranslationEntityType.SEO_TITLE;
import static com.maxsolch.shop.translation.domain.TranslationEntityType.TITLE;
import static org.assertj.core.api.Assertions.assertThat;

class CatalogOverlayTest {

    private static final String PRODUCT = "11111111-1111-1111-1111-111111111111";
    private static final String VARIANT = "22222222-2222-2222-2222-222222222222";
    private static final String TAG = "33333333-3333-3333-3333-333333333333";

    private static Entry current(String source, String text) {
        return new Entry(text, SourceHash.sha256Hex(source), TranslationOrigin.AI);
    }

    private static ProductDto product(String title, String description, String seoTitle) {
        return new ProductDto(PRODUCT, title, description, 10_000, "UAH", 3, true, 0, List.of(),
                List.of(new ProductVariantDto(VARIANT, "Красный", 3, 0)),
                List.of(new TagDto(TAG, "Ковры", "kovry", 0, true)),
                "kover", null, seoTitle, null, Instant.EPOCH, "Attack Shark", "AS-1", null, 0,
                null, null, "MARKDOWN", "Вскрыта упаковка", Map.of("weight_g", 51));
    }

    @Test
    void currentTranslationReplacesTheSource() {
        Overlay overlay = new Overlay(Map.of(
                new Key(TranslationEntityType.PRODUCT, PRODUCT, TITLE), current("Ковер", "Килимок"),
                new Key(TranslationEntityType.PRODUCT, PRODUCT, DESCRIPTION), current("Мягкий", "М'який"),
                new Key(TranslationEntityType.VARIANT, VARIANT, NAME), current("Красный", "Червоний"),
                new Key(TranslationEntityType.CATEGORY, TAG, NAME), current("Ковры", "Килимки")));

        ProductDto out = CatalogOverlay.product(overlay, product("Ковер", "Мягкий", null));

        assertThat(out.title()).isEqualTo("Килимок");
        assertThat(out.description()).isEqualTo("М'який");
        assertThat(out.variants().get(0).name()).isEqualTo("Червоний");
        assertThat(out.tags().get(0).name()).isEqualTo("Килимки");
        // untouched fields
        assertThat(out.slug()).isEqualTo("kover");
        assertThat(out.priceMinor()).isEqualTo(10_000);
        assertThat(out.variants().get(0).stock()).isEqualTo(3);
        assertThat(out.tags().get(0).slug()).isEqualTo("kovry");
    }

    @Test
    void staleTranslationIsNeverShown() {
        // translated from the OLD title; the admin has renamed the product since
        Overlay overlay = new Overlay(Map.of(
                new Key(TranslationEntityType.PRODUCT, PRODUCT, TITLE), current("Ковер", "Килимок"),
                new Key(TranslationEntityType.PRODUCT, PRODUCT, DESCRIPTION), current("Цена 100", "Ціна 100")));

        ProductDto out = CatalogOverlay.product(overlay, product("Ковер большой", "Цена 120", null));

        assertThat(out.title()).isEqualTo("Ковер большой");
        assertThat(out.description()).isEqualTo("Цена 120");
    }

    @Test
    void missingTranslationOrMissingSourceKeepsTheOriginal() {
        Overlay overlay = new Overlay(Map.of(
                new Key(TranslationEntityType.PRODUCT, PRODUCT, TITLE), current("Ковер", "Килимок"),
                // a translation for a field whose source is now empty must not resurrect it
                new Key(TranslationEntityType.PRODUCT, PRODUCT, SEO_TITLE), current("SEO", "SEO uk")));

        ProductDto out = CatalogOverlay.product(overlay, product("Ковер", "Мягкий", null));

        assertThat(out.title()).isEqualTo("Килимок");
        assertThat(out.description()).isEqualTo("Мягкий");
        assertThat(out.seoTitle()).isNull();
        assertThat(out.variants().get(0).name()).isEqualTo("Красный");
        assertThat(out.tags().get(0).name()).isEqualTo("Ковры");
    }

    @Test
    void conditionNoteIsTranslatedAndCatalogFieldsPassThrough() {
        Overlay overlay = new Overlay(Map.of(
                new Key(TranslationEntityType.PRODUCT, PRODUCT, TranslationEntityType.CONDITION_NOTE),
                current("Вскрыта упаковка", "Розкрита упаковка")));

        ProductDto out = CatalogOverlay.product(overlay, product("Ковер", "Мягкий", null));

        assertThat(out.conditionNote()).isEqualTo("Розкрита упаковка");
        assertThat(out.condition()).isEqualTo("MARKDOWN");
        assertThat(out.specs()).containsEntry("weight_g", 51);
    }

    @Test
    void productBrandAndSkuPassThroughUntranslated() {
        Overlay overlay = new Overlay(Map.of(
                new Key(TranslationEntityType.PRODUCT, PRODUCT, TITLE), current("Ковер", "Килимок")));
        ProductDto out = CatalogOverlay.product(overlay, product("Ковер", null, null));
        assertThat(out.brand()).isEqualTo("Attack Shark");
        assertThat(out.sku()).isEqualTo("AS-1");
    }

    @Test
    void tagOverlay() {
        Overlay overlay = new Overlay(Map.of(
                new Key(TranslationEntityType.CATEGORY, TAG, NAME), current("Ковры", "Килимки")));

        assertThat(CatalogOverlay.tags(overlay, List.of(new TagDto(TAG, "Ковры", "kovry", 1, true))).get(0).name())
                .isEqualTo("Килимки");
    }
}
