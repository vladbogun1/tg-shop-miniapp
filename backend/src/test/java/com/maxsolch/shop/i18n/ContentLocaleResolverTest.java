package com.maxsolch.shop.i18n;

import com.maxsolch.shop.translation.ContentLocale;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.servlet.LocaleResolver;

import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;

/** Content language of a request: Accept-Language, overridden by ?lang= on the catalog endpoints. */
class ContentLocaleResolverTest {

    private final LocaleResolver resolver = new LocaleConfig().localeResolver();

    private String resolve(String uri, String acceptLanguage, String lang) {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", uri);
        if (acceptLanguage != null) {
            req.addHeader("Accept-Language", acceptLanguage);
        }
        if (lang != null) {
            req.setParameter("lang", lang);
        }
        return ContentLocale.normalize(resolver.resolveLocale(req));
    }

    @Test
    void acceptLanguageDecides() {
        assertThat(resolve("/api/products", "ru-RU,ru;q=0.9", null)).isEqualTo("ru");
        assertThat(resolve("/api/products", "en-GB", null)).isEqualTo("en");
        assertThat(resolve("/api/products", "uk-UA", null)).isEqualTo("uk");
    }

    @Test
    void unsupportedOrMissingHeaderFallsBackToUkrainian() {
        // same rule as the interface texts (I18N.md): an unknown language is Ukrainian
        assertThat(resolve("/api/products", "de-DE", null)).isEqualTo("uk");
        assertThat(resolve("/api/products", null, null)).isEqualTo("uk");
    }

    @Test
    void langParamWinsOnCatalogEndpoints() {
        assertThat(resolve("/api/public/products/by-slug/kover", "uk", "en")).isEqualTo("en");
        assertThat(resolve("/api/public/categories", "en", "ru")).isEqualTo("ru");
        assertThat(resolve("/api/products", "ru", "uk")).isEqualTo("uk");
        assertThat(resolve("/api/products/abc", "ru", "EN")).isEqualTo("en");
        assertThat(resolve("/api/public/tags", "ru", "en-GB")).isEqualTo("en");
        assertThat(resolve("/api/payment-options", "ru", "en")).isEqualTo("en");
    }

    @Test
    void langParamIgnoredElsewhereOrWhenUnsupported() {
        assertThat(resolve("/api/me/orders", "ru", "en")).isEqualTo("ru");
        assertThat(resolve("/api/admin/translations/export", "ru", "en")).isEqualTo("ru");
        assertThat(resolve("/api/products", "ru", "de")).isEqualTo("ru");
        assertThat(resolve("/api/products", "ru", "")).isEqualTo("ru");
    }

    @Test
    void normalizeCollapsesToThreeKeys() {
        assertThat(ContentLocale.normalize("uk-UA")).isEqualTo("uk");
        assertThat(ContentLocale.normalize("EN_gb")).isEqualTo("en");
        assertThat(ContentLocale.normalize("ru")).isEqualTo("ru");
        assertThat(ContentLocale.normalize("de")).isEqualTo("ru");
        assertThat(ContentLocale.normalize((String) null)).isEqualTo("ru");
        assertThat(ContentLocale.normalize((Locale) null)).isEqualTo("ru");
    }
}
