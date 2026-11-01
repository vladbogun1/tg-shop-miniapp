package com.maxsolch.shop.platform.i18n;

import com.maxsolch.shop.catalog.domain.CatalogSnapshot;
import com.maxsolch.shop.catalog.domain.ProductCondition;
import com.maxsolch.shop.translation.app.BotTexts;
import com.maxsolch.shop.translation.domain.ContentLocale;
import org.junit.jupiter.api.Test;

import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * One list of languages: what the app speaks is exactly {@link AppLocale}, and each language in it
 * has everything it needs. Adding a value to the enum makes these fail until the texts exist.
 */
class AppLocaleTest {

    private static Properties bundle(String name) throws Exception {
        Properties p = new Properties();
        try (var in = AppLocaleTest.class.getResourceAsStream("/i18n/" + name)) {
            assertThat(in).as("bundle %s", name).isNotNull();
            p.load(new InputStreamReader(in, StandardCharsets.UTF_8));
        }
        return p;
    }

    @Test
    void theListAndItsDefault() {
        assertThat(AppLocale.codes()).containsExactly("uk", "ru", "en");
        assertThat(AppLocale.DEFAULT).isEqualTo(AppLocale.UK);
        assertThat(Messages.FALLBACK.getLanguage()).isEqualTo("uk");
        assertThat(AppLocale.CONTENT_SOURCE).isEqualTo(AppLocale.RU);
    }

    @Test
    void parseNarrowsToALanguageWeHave() {
        assertThat(AppLocale.parse("ru-RU")).isEqualTo(AppLocale.RU);
        assertThat(AppLocale.parse(" EN_gb ")).isEqualTo(AppLocale.EN);
        assertThat(AppLocale.parse("de")).isNull();
        assertThat(AppLocale.parse(null)).isNull();
        assertThat(AppLocale.parseOrDefault("de")).isEqualTo(AppLocale.UK);
        assertThat(Messages.normalize("uk-UA")).isEqualTo(AppLocale.UK.javaLocale());
        assertThat(Messages.normalize("pl")).isNull();
    }

    @Test
    void everyLanguageHasABundleAndBotTexts() throws Exception {
        for (AppLocale l : AppLocale.values()) {
            Properties p = bundle("messages_" + l.code() + ".properties");
            for (String key : BotTexts.KEYS) {
                assertThat(p.getProperty(key)).as("%s[%s]", l.code(), key).isNotBlank();
            }
        }
    }

    @Test
    void everyLanguageHasTheShopTexts() {
        for (AppLocale l : AppLocale.values()) {
            for (ProductCondition c : ProductCondition.values()) {
                assertThat(c.label(l.code())).as("%s in %s", c, l.code()).isNotBlank();
            }
            assertThat(CatalogSnapshot.pick(l.code(), "ru", "uk", "en")).isEqualTo(l.code());
        }
    }

    @Test
    void contentLanguagesFollowTheList() {
        assertThat(ContentLocale.TRANSLATED).containsExactly("uk", "en");
        assertThat(ContentLocale.ALL).containsExactly("ru", "uk", "en");
        assertThat(ContentLocale.normalize("de")).isEqualTo("ru");
    }

    @Test
    void siteUrlPrefixes() {
        assertThat(List.of(AppLocale.values()).stream().map(AppLocale::sitePrefix).toList())
                .containsExactly("", "/ru", "/en");
    }
}
