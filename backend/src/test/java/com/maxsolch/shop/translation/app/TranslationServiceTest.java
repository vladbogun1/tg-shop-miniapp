package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.translation.domain.SourceHash;
import com.maxsolch.shop.translation.domain.ContentTranslation;
import com.maxsolch.shop.translation.domain.ContentTranslationId;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.translation.domain.TranslationOrigin;
import com.maxsolch.shop.translation.infra.ContentTranslationRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.translation.app.TranslationService.Entry;
import com.maxsolch.shop.translation.app.TranslationService.Key;
import com.maxsolch.shop.translation.app.TranslationService.Overlay;
import com.maxsolch.shop.translation.domain.TranslationsChanged;
import org.junit.jupiter.api.Test;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;

import java.util.List;
import java.util.Map;

import static com.maxsolch.shop.translation.domain.TranslationEntityType.DESCRIPTION;
import static com.maxsolch.shop.translation.domain.TranslationEntityType.SEO_TITLE;
import static com.maxsolch.shop.translation.domain.TranslationEntityType.TITLE;
import static org.assertj.core.api.Assertions.assertThat;
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
        assertThat(SourceHash.sha256Hex("abc"))
                .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assertThat(SourceHash.sha256Hex("Ковер"))
                .isEqualTo("4628132cd6c1c377fe3fbe3009326f3c362deb805f53b51280a5e2d296da044b");
    }

    @Test
    void hashIsOfTheSourceAsStoredWithoutTrim() {
        assertThat(SourceHash.sha256Hex("Ковер "))
                .isEqualTo("7db393ef11e0db28e10479807d89a4927be80f37824bbb64f31e16232999f0fc")
                .isNotEqualTo(SourceHash.sha256Hex("Ковер"));
    }

    // ---------------------------------------------------------------- overlay

    private static Entry current(String source, String text) {
        return new Entry(text, SourceHash.sha256Hex(source), TranslationOrigin.AI);
    }

    @Test
    void textIsReplacedOnlyByACurrentTranslation() {
        Overlay overlay = new Overlay(Map.of(
                new Key(TranslationEntityType.PRODUCT, PRODUCT, TITLE), current("Ковер", "Килимок")));

        assertThat(overlay.text(TranslationEntityType.PRODUCT, PRODUCT, TITLE, "Ковер")).isEqualTo("Килимок");
        // the admin renamed the product since: the stale translation is never shown
        assertThat(overlay.text(TranslationEntityType.PRODUCT, PRODUCT, TITLE, "Ковер большой")).isEqualTo("Ковер большой");
        assertThat(overlay.text(TranslationEntityType.PRODUCT, PRODUCT, DESCRIPTION, "Мягкий")).isEqualTo("Мягкий");
        assertThat(overlay.text(TranslationEntityType.PRODUCT, PRODUCT, TITLE, null)).isNull();
    }

    @Test
    void categorySeoGivesOnlyCurrentTranslationsNeverTheRussianSource() {
        Overlay overlay = new Overlay(Map.of(
                new Key(TranslationEntityType.CATEGORY, TAG, SEO_TITLE), current("Коврики купить", "Килимки купити"),
                new Key(TranslationEntityType.CATEGORY, TAG, TranslationEntityType.H1), current("Старый H1", "Старий H1")));

        assertThat(overlay.translationOrNull(TranslationEntityType.CATEGORY, TAG, SEO_TITLE, "Коврики купить"))
                .isEqualTo("Килимки купити");
        assertThat(overlay.translationOrNull(TranslationEntityType.CATEGORY, TAG, TranslationEntityType.H1, "Новый H1"))
                .isNull(); // stale: source changed
        assertThat(overlay.translationOrNull(TranslationEntityType.CATEGORY, TAG, TranslationEntityType.SEO_DESCRIPTION,
                "Описание")).isNull();
    }

    // ---------------------------------------------------------------- snapshot per language

    private static ContentTranslation row(String locale, String source, String text) {
        ContentTranslation t = new ContentTranslation(new ContentTranslationId(
                TranslationEntityType.PRODUCT, UuidUtil.toBytes(PRODUCT), TITLE, locale));
        t.setText(text);
        t.setSourceHash(SourceHash.sha256Hex(source));
        return t;
    }

    @Test
    void russianAndUnknownLanguagesNeverHitTheTable() {
        ContentTranslationRepository repo = mock(ContentTranslationRepository.class);
        TranslationService service = new TranslationService(repo, new ConcurrentMapCacheManager());

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
        TranslationService service = new TranslationService(repo, new ConcurrentMapCacheManager());

        assertThat(service.overlay("uk").text(TranslationEntityType.PRODUCT, PRODUCT, TITLE, "Ковер")).isEqualTo("Килимок");
        assertThat(service.overlay("uk-UA").text(TranslationEntityType.PRODUCT, PRODUCT, TITLE, "Ковер")).isEqualTo("Килимок");
        assertThat(service.overlay("en").text(TranslationEntityType.PRODUCT, PRODUCT, TITLE, "Ковер")).isEqualTo("Rug");
        verify(repo, times(1)).findByLocale("uk");

        service.onTranslationsChanged(new TranslationsChanged());
        service.overlay("uk");
        verify(repo, times(2)).findByLocale("uk");
    }
}
