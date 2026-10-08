package com.maxsolch.shop.service;

import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.catalog.CategoryRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** URL slugs: uk/ru transliteration, normalisation, length cap, collision suffixes. */
@ExtendWith(MockitoExtension.class)
class SlugServiceTest {

    @Mock
    ProductRepository productRepository;
    @Mock
    CategoryRepository categoryRepository;
    @InjectMocks
    SlugService service;

    // ---------------------------------------------------------------- transliteration

    @Test
    void russianTitleUsesRussianTable() {
        assertThat(SlugService.slugify("Ковер XL белый")).isEqualTo("kover-xl-belyy");
        assertThat(SlugService.slugify("Кейкапы Япония 3.0")).isEqualTo("keykapy-yaponiya-3-0");
        assertThat(SlugService.slugify("Щётка, ёжик и чай")).isEqualTo("shchetka-ezhik-i-chay");
        assertThat(SlugService.slugify("Игровая мышь")).isEqualTo("igrovaya-mysh");
    }

    @Test
    void ukrainianLettersSwitchToUkrainianTable() {
        // г → h and и → y only in Ukrainian; triggered by і/ї/є/ґ in the text.
        assertThat(SlugService.slugify("Гарні навушники")).isEqualTo("harni-navushnyky");
        assertThat(SlugService.slugify("Їжак і ґанок")).isEqualTo("yizhak-i-ganok");
        assertThat(SlugService.slugify("Європа")).isEqualTo("yevropa");
        // Apostrophe disappears instead of splitting the word.
        assertThat(SlugService.slugify("М'ята подушка для пальців")).isEqualTo("myata-podushka-dlya-paltsiv");
    }

    @Test
    void latinIsLowercasedAndPunctuationCollapsed() {
        assertThat(SlugService.slugify("  Wooting 80HE Ghost  ")).isEqualTo("wooting-80he-ghost");
        assertThat(SlugService.slugify("X-raypad Aqua Control+ (AC+)  Wave Pink XXL"))
                .isEqualTo("x-raypad-aqua-control-plus-ac-plus-wave-pink-xxl");
        assertThat(SlugService.slugify("Café & Crème")).isEqualTo("cafe-and-creme");
        assertThat(SlugService.slugify("MCHOSE A7Ultra V2 (Черный)")).isEqualTo("mchose-a7ultra-v2-chernyy");
    }

    @Test
    void onlyUrlSafeCharactersRemain() {
        String slug = SlugService.slugify("Ковер «XL» — 100% 😀 #1 / тест");
        assertThat(slug).matches("[a-z0-9]+(-[a-z0-9]+)*");
        assertThat(slug).isEqualTo("kover-xl-100-1-test");
    }

    @Test
    void emptyOrSymbolOnlyGivesEmpty() {
        assertThat(SlugService.slugify(null)).isEmpty();
        assertThat(SlugService.slugify("   ")).isEmpty();
        assertThat(SlugService.slugify("😀 — !!")).isEmpty();
    }

    @Test
    void longTitlesAreCutAtAWordBoundary() {
        String title = "очень длинное название товара ".repeat(10);
        String slug = SlugService.slugify(title);
        assertThat(slug.length()).isLessThanOrEqualTo(SlugService.MAX_LENGTH);
        assertThat(slug).doesNotEndWith("-");
        assertThat(slug).endsWith("tovara").as("cut between words, not inside one");
    }

    // ---------------------------------------------------------------- uniqueness

    @Test
    void uniquifyAppendsTheFirstFreeNumber() {
        Set<String> taken = Set.of("mysh", "mysh-2", "mysh-3");
        assertThat(SlugService.uniquify("mysh", taken::contains)).isEqualTo("mysh-4");
        assertThat(SlugService.uniquify("kover", taken::contains)).isEqualTo("kover");
    }

    @Test
    void uniquifyKeepsTheSuffixWithinTheLengthCap() {
        String base = "a".repeat(SlugService.MAX_LENGTH);
        String slug = SlugService.uniquify(base, s -> s.equals(base));
        assertThat(slug).hasSize(SlugService.MAX_LENGTH).endsWith("-2");
    }

    @Test
    void productSlugOnCreateChecksAllProducts() {
        when(productRepository.existsBySlug("wooting-80he-ghost")).thenReturn(true);
        when(productRepository.existsBySlug("wooting-80he-ghost-2")).thenReturn(false);

        assertThat(service.forProduct(null, "Wooting 80HE Ghost", null)).isEqualTo("wooting-80he-ghost-2");
        verify(productRepository, never()).existsBySlugAndIdNot(anyString(), any());
    }

    @Test
    void productSlugOnEditIgnoresTheProductItself() {
        byte[] self = new byte[16];
        when(productRepository.existsBySlugAndIdNot(eq("kover-xl"), eq(self))).thenReturn(false);

        assertThat(service.forProduct("", "Ковер XL", self)).isEqualTo("kover-xl");
    }

    @Test
    void explicitSlugWinsOverTitleAndIsNormalised() {
        when(productRepository.existsBySlug("my-custom-url")).thenReturn(false);

        assertThat(service.forProduct("  My Custom URL ", "Ковер XL", null)).isEqualTo("my-custom-url");
    }

    @Test
    void untransliterableNamesFallBackToAGenericSlug() {
        when(categoryRepository.existsBySlug("category")).thenReturn(false);

        assertThat(service.forCategory(null, "😀", null)).isEqualTo("category");
    }

    @Test
    void theMarkdownCollectionSlugIsReservedForCategories() {
        when(categoryRepository.existsBySlug("utsenka-2")).thenReturn(false);

        assertThat(service.categorySlugTaken("utsenka", null)).isTrue();
        assertThat(service.forCategory("utsenka", "Уценка", null)).isEqualTo("utsenka-2");
    }
}
