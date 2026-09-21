package com.maxsolch.shop.i18n;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Properties;
import java.util.Set;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The message bundles must stay in step.
 *
 * <p>A key missing from one language does not fail, and that is the problem: with
 * {@code fallback-to-system-locale: false} the lookup quietly falls through to the default bundle,
 * so an English-reading customer would get a message in Ukrainian and nothing anywhere would say
 * so. This test is the only thing that notices.
 */
class MessageBundlesTest {

    private static final List<String> LOCALES = List.of("ru", "uk", "en");

    private static Properties load(String name) throws IOException {
        Properties props = new Properties();
        try (InputStream in = MessageBundlesTest.class.getResourceAsStream("/i18n/" + name)) {
            assertThat(in).as("bundle %s exists", name).isNotNull();
            props.load(new InputStreamReader(in, StandardCharsets.UTF_8));
        }
        return props;
    }

    @Test
    void everyLanguageHasEveryKey() throws IOException {
        Set<String> reference = new TreeSet<>(load("messages_ru.properties").stringPropertyNames());
        assertThat(reference).isNotEmpty();

        for (String locale : LOCALES) {
            Set<String> keys = new TreeSet<>(load("messages_" + locale + ".properties").stringPropertyNames());
            assertThat(keys)
                    .as("messages_%s.properties has exactly the keys of the Russian source", locale)
                    .containsExactlyInAnyOrderElementsOf(reference);
        }
    }

    /**
     * The no-match default is Ukrainian, which is the app's fallback language. It is a copy of the
     * Ukrainian bundle, so it drifts the moment somebody edits one and not the other.
     */
    @Test
    void defaultBundleMatchesUkrainian() throws IOException {
        Properties ukrainian = load("messages_uk.properties");
        Properties fallback = load("messages.properties");

        assertThat(fallback.stringPropertyNames())
                .containsExactlyInAnyOrderElementsOf(ukrainian.stringPropertyNames());
        for (String key : ukrainian.stringPropertyNames()) {
            assertThat(fallback.getProperty(key))
                    .as("messages.properties[%s] matches the Ukrainian bundle", key)
                    .isEqualTo(ukrainian.getProperty(key));
        }
    }

    /** A phrase that takes an argument must take it in every language, or the text loses data. */
    @Test
    void placeholdersMatchAcrossLanguages() throws IOException {
        Properties russian = load("messages_ru.properties");

        for (String locale : List.of("uk", "en")) {
            Properties other = load("messages_" + locale + ".properties");
            for (String key : russian.stringPropertyNames()) {
                assertThat(placeholders(other.getProperty(key)))
                        .as("%s[%s] uses the same placeholders as the Russian source", locale, key)
                        .isEqualTo(placeholders(russian.getProperty(key)));
            }
        }
    }

    private static Set<String> placeholders(String value) {
        Set<String> found = new TreeSet<>();
        if (value == null) {
            return found;
        }
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\\{(\\d+)}").matcher(value);
        while (m.find()) {
            found.add(m.group(1));
        }
        return found;
    }
}
