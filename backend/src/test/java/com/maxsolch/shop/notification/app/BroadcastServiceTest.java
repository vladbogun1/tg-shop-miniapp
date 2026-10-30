package com.maxsolch.shop.notification.app;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** R9: language of a recipient, narrowing the audience by language, text variant with fallback. */
class BroadcastServiceTest {

    @Test
    void languageIsTheShopChoiceThenTelegramThenUkrainian() {
        assertThat(BroadcastRules.langOf("en", "ru")).isEqualTo("en");
        assertThat(BroadcastRules.langOf(null, "ru-RU")).isEqualTo("ru");
        assertThat(BroadcastRules.langOf(null, "de")).isEqualTo("uk");
        assertThat(BroadcastRules.langOf(null, null)).isEqualTo("uk");
    }

    @Test
    void audienceIsNarrowedToTheChosenLanguage() {
        Map<Long, String> langs = Map.of(1L, "uk", 2L, "ru", 3L, "en");
        List<Long> ids = List.of(1L, 2L, 3L, 4L); // 4 = unknown -> fallback uk

        assertThat(BroadcastRules.recipients(ids, langs, null)).hasSize(4);
        assertThat(BroadcastRules.recipients(ids, langs, "uk"))
                .extracting(BroadcastRules.Recipient::id).containsExactly(1L, 4L);
        assertThat(BroadcastRules.recipients(ids, langs, "en"))
                .extracting(BroadcastRules.Recipient::id).containsExactly(3L);
    }

    @Test
    void eachRecipientGetsTheirVersionOrTheMainText() {
        assertThat(BroadcastRules.textFor("uk", "main", "укр", null, "eng")).isEqualTo("укр");
        assertThat(BroadcastRules.textFor("ru", "main", "укр", null, "eng")).isEqualTo("main");
        assertThat(BroadcastRules.textFor("en", "main", "укр", "  ", "eng")).isEqualTo("eng");
        assertThat(BroadcastRules.textFor(null, "main", "укр", "рус", "eng")).isEqualTo("main");
    }

    @Test
    void onlyKnownLanguagesFilter() {
        assertThat(BroadcastRules.normLang(" UK ")).isEqualTo("uk");
        assertThat(BroadcastRules.normLang("de")).isNull();
        assertThat(BroadcastRules.normLang("")).isNull();
    }
}
