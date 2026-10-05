package com.maxsolch.shop.translation;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.ProductVariantRepository;
import com.maxsolch.shop.translation.TranslationService.Entry;
import com.maxsolch.shop.translation.TranslationService.Key;
import com.maxsolch.shop.translation.TranslationService.Overlay;
import com.maxsolch.shop.web.dto.PaymentOptionDto;
import com.maxsolch.shop.web.dto.ProductDto;
import com.maxsolch.shop.web.dto.ProductVariantDto;
import com.maxsolch.shop.web.dto.TagDto;
import com.maxsolch.shop.web.dto.TagSeoDto;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static com.maxsolch.shop.translation.TranslationEntityType.DESCRIPTION;
import static com.maxsolch.shop.translation.TranslationEntityType.NAME;
import static com.maxsolch.shop.translation.TranslationEntityType.SEO_TITLE;
import static com.maxsolch.shop.translation.TranslationEntityType.TITLE;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TranslationServiceTest {

    private static final String PRODUCT = "11111111-1111-1111-1111-111111111111";
    private static final String VARIANT = "22222222-2222-2222-2222-222222222222";
    private static final String TAG = "33333333-3333-3333-3333-333333333333";
    private static final String PAYMENT = "44444444-4444-4444-4444-444444444444";

    // ---------------------------------------------------------------- hash

    @Test
    void hashIsLowerHexSha256OfUtf8() {
        assertThat(TranslationService.sha256Hex("abc"))
                .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assertThat(TranslationService.sha256Hex("Ковер"))
                .isEqualTo("4628132cd6c1c377fe3fbe3009326f3c362deb805f53b51280a5e2d296da044b");
    }

    @Test
    void hashIsOfTheSourceAsStoredWithoutTrim() {
        assertThat(TranslationService.sha256Hex("Ковер "))
                .isEqualTo("7db393ef11e0db28e10479807d89a4927be80f37824bbb64f31e16232999f0fc")
                .isNotEqualTo(TranslationService.sha256Hex("Ковер"));
    }

    // ---------------------------------------------------------------- overlay

    private static Entry current(String source, String text) {
        return new Entry(text, TranslationService.sha256Hex(source), TranslationOrigin.AI);
    }

    private static ProductDto product(String title, String description, String seoTitle) {
        return new ProductDto(PRODUCT, title, description, 10_000, "UAH", 3, true, 0, List.of(),
                List.of(new ProductVariantDto(VARIANT, "Красный", 3, 0)),
                List.of(new TagDto(TAG, "Ковры", "kovry", 0, true)),
                "kover", null, seoTitle, null, Instant.EPOCH, "Attack Shark", "AS-1");
    }

    @Test
    void currentTranslationReplacesTheSource() {
        Overlay overlay = new Overlay(Map.of(
                new Key(TranslationEntityType.PRODUCT, PRODUCT, TITLE), current("Ковер", "Килимок"),
                new Key(TranslationEntityType.PRODUCT, PRODUCT, DESCRIPTION), current("Мягкий", "М'який"),
                new Key(TranslationEntityType.VARIANT, VARIANT, NAME), current("Красный", "Червоний"),
                new Key(TranslationEntityType.TAG, TAG, NAME), current("Ковры", "Килимки")));

        ProductDto out = overlay.product(product("Ковер", "Мягкий", null));

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

        ProductDto out = overlay.product(product("Ковер большой", "Цена 120", null));

        assertThat(out.title()).isEqualTo("Ковер большой");
        assertThat(out.description()).isEqualTo("Цена 120");
    }

    @Test
    void missingTranslationOrMissingSourceKeepsTheOriginal() {
        Overlay overlay = new Overlay(Map.of(
                new Key(TranslationEntityType.PRODUCT, PRODUCT, TITLE), current("Ковер", "Килимок"),
                // a translation for a field whose source is now empty must not resurrect it
                new Key(TranslationEntityType.PRODUCT, PRODUCT, SEO_TITLE), current("SEO", "SEO uk")));

        ProductDto out = overlay.product(product("Ковер", "Мягкий", null));

        assertThat(out.title()).isEqualTo("Килимок");
        assertThat(out.description()).isEqualTo("Мягкий");
        assertThat(out.seoTitle()).isNull();
        assertThat(out.variants().get(0).name()).isEqualTo("Красный");
        assertThat(out.tags().get(0).name()).isEqualTo("Ковры");
    }

    @Test
    void paymentOptionAndTagOverlay() {
        Overlay overlay = new Overlay(Map.of(
                new Key(TranslationEntityType.PAYMENT_OPTION, PAYMENT, TITLE), current("Наложка", "Накладений платіж"),
                new Key(TranslationEntityType.TAG, TAG, NAME), current("Ковры", "Килимки")));

        PaymentOptionDto po = overlay.paymentOption(new PaymentOptionDto(PAYMENT, "Наложка", "Описание", true, 10_000));
        assertThat(po.title()).isEqualTo("Накладений платіж");
        assertThat(po.description()).isEqualTo("Описание");
        assertThat(po.requiresPrepayment()).isTrue();

        assertThat(overlay.tags(List.of(new TagDto(TAG, "Ковры", "kovry", 1, true))).get(0).name())
                .isEqualTo("Килимки");
    }

    @Test
    void tagSeoGivesOnlyCurrentTranslationsNeverTheRussianSource() {
        Overlay overlay = new Overlay(Map.of(
                new Key(TranslationEntityType.TAG, TAG, SEO_TITLE), current("Коврики купить", "Килимки купити"),
                new Key(TranslationEntityType.TAG, TAG, TranslationEntityType.H1), current("Старый H1", "Старий H1"),
                new Key(TranslationEntityType.TAG, TAG, TranslationEntityType.INTRO_TEXT), current("Текст", "Текст uk")));

        TagSeoDto out = overlay.tagSeoTranslated(new TagSeoDto(TAG, "Коврики купить", "Описание", "Новый H1", "Текст"));

        assertThat(out.seoTitle()).isEqualTo("Килимки купити");
        assertThat(out.seoDescription()).isNull(); // no translation -> the site's template
        assertThat(out.h1()).isNull();             // stale: source changed
        assertThat(out.introText()).isEqualTo("Текст uk");

        assertThat(new Overlay(Map.of()).tagSeoTranslated(new TagSeoDto(TAG, "a", "b", "c", "d")).isEmpty()).isTrue();
    }

    @Test
    void productBrandAndSkuPassThroughUntranslated() {
        Overlay overlay = new Overlay(Map.of(
                new Key(TranslationEntityType.PRODUCT, PRODUCT, TITLE), current("Ковер", "Килимок")));
        ProductDto out = overlay.product(product("Ковер", null, null));
        assertThat(out.brand()).isEqualTo("Attack Shark");
        assertThat(out.sku()).isEqualTo("AS-1");
    }

    // ---------------------------------------------------------------- snapshot per language

    private static ContentTranslation row(String locale, String source, String text) {
        ContentTranslation t = new ContentTranslation(new ContentTranslationId(
                TranslationEntityType.PRODUCT, UuidUtil.toBytes(PRODUCT), TITLE, locale));
        t.setText(text);
        t.setSourceHash(TranslationService.sha256Hex(source));
        return t;
    }

    @Test
    void russianAndUnknownLanguagesNeverHitTheTable() {
        ContentTranslationRepository repo = mock(ContentTranslationRepository.class);
        TranslationService service = new TranslationService(repo, mock(ProductRepository.class),
                mock(ProductVariantRepository.class));

        assertThat(service.overlay("ru").active()).isFalse();
        assertThat(service.overlay("de").active()).isFalse();
        assertThat(service.overlay(null).active()).isFalse();
        verify(repo, never()).findByLocale(org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void snapshotIsLoadedOncePerLanguageUntilInvalidated() {
        ContentTranslationRepository repo = mock(ContentTranslationRepository.class);
        when(repo.findByLocale("uk")).thenReturn(List.of(row("uk", "Ковер", "Килимок")));
        when(repo.findByLocale("en")).thenReturn(List.of(row("en", "Ковер", "Rug")));
        TranslationService service = new TranslationService(repo, mock(ProductRepository.class),
                mock(ProductVariantRepository.class));

        assertThat(service.overlay("uk").product(product("Ковер", null, null)).title()).isEqualTo("Килимок");
        assertThat(service.overlay("uk-UA").product(product("Ковер", null, null)).title()).isEqualTo("Килимок");
        assertThat(service.overlay("en").product(product("Ковер", null, null)).title()).isEqualTo("Rug");
        verify(repo, times(1)).findByLocale("uk");

        service.invalidate();
        service.overlay("uk");
        verify(repo, times(2)).findByLocale("uk");
    }

    // ---------------------------------------------------------------- customer order lines

    @Test
    void orderLineUsesCurrentProductTranslationElseSnapshot() {
        ContentTranslationRepository repo = mock(ContentTranslationRepository.class);
        ProductRepository products = mock(ProductRepository.class);
        ProductVariantRepository variants = mock(ProductVariantRepository.class);
        String otherProduct = "55555555-5555-5555-5555-555555555555";
        ContentTranslation staleRow = new ContentTranslation(new ContentTranslationId(
                TranslationEntityType.PRODUCT, UuidUtil.toBytes(otherProduct), TITLE, "uk"));
        staleRow.setText("Старий переклад");
        staleRow.setSourceHash(TranslationService.sha256Hex("Было"));
        when(repo.findByLocale("uk")).thenReturn(List.of(row("uk", "Ковер", "Килимок"), staleRow));
        List<Object[]> titleRows = new ArrayList<>();
        titleRows.add(new Object[]{UuidUtil.toBytes(PRODUCT), "Ковер"});
        titleRows.add(new Object[]{UuidUtil.toBytes(otherProduct), "Стало"});
        when(products.titlesByIds(anyCollection())).thenReturn(titleRows);

        TranslationService service = new TranslationService(repo, products, variants);
        TranslationService.ItemNames names = service.orderItemNames(
                List.of(UuidUtil.toBytes(PRODUCT), UuidUtil.toBytes(otherProduct)), List.of(), "uk");

        assertThat(names.title(PRODUCT, "Ковер (снимок)")).isEqualTo("Килимок");
        assertThat(names.title(otherProduct, "Было")).isEqualTo("Было");
        assertThat(names.title(null, "Удалённый товар")).isEqualTo("Удалённый товар");

        // Russian: no lookups at all
        assertThat(service.orderItemNames(List.of(UuidUtil.toBytes(PRODUCT)), List.of(), "ru"))
                .isSameAs(TranslationService.ItemNames.EMPTY);
    }
}
