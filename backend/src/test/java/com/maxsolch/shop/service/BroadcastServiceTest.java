package com.maxsolch.shop.service;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** R9: language of a recipient, narrowing the audience by language, text variant with fallback. */
class BroadcastServiceTest {

    @Test
    void languageIsTheShopChoiceThenTelegramThenUkrainian() {
        assertThat(BroadcastService.langOf("en", "ru")).isEqualTo("en");
        assertThat(BroadcastService.langOf(null, "ru-RU")).isEqualTo("ru");
        assertThat(BroadcastService.langOf(null, "de")).isEqualTo("uk");
        assertThat(BroadcastService.langOf(null, null)).isEqualTo("uk");
    }

    @Test
    void audienceIsNarrowedToTheChosenLanguage() {
        Map<Long, String> langs = Map.of(1L, "uk", 2L, "ru", 3L, "en");
        List<Long> ids = List.of(1L, 2L, 3L, 4L); // 4 = unknown -> fallback uk

        assertThat(BroadcastService.recipients(ids, langs, null)).hasSize(4);
        assertThat(BroadcastService.recipients(ids, langs, "uk"))
                .extracting(BroadcastService.Recipient::id).containsExactly(1L, 4L);
        assertThat(BroadcastService.recipients(ids, langs, "en"))
                .extracting(BroadcastService.Recipient::id).containsExactly(3L);
    }

    @Test
    void eachRecipientGetsTheirVersionOrTheMainText() {
        assertThat(BroadcastService.textFor("uk", "main", "укр", null, "eng")).isEqualTo("укр");
        assertThat(BroadcastService.textFor("ru", "main", "укр", null, "eng")).isEqualTo("main");
        assertThat(BroadcastService.textFor("en", "main", "укр", "  ", "eng")).isEqualTo("eng");
        assertThat(BroadcastService.textFor(null, "main", "укр", "рус", "eng")).isEqualTo("main");
    }

    @Test
    void onlyKnownLanguagesFilter() {
        assertThat(BroadcastService.normLang(" UK ")).isEqualTo("uk");
        assertThat(BroadcastService.normLang("de")).isNull();
        assertThat(BroadcastService.normLang("")).isNull();
    }
}
