package com.maxsolch.shop.platform.error;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.type.filter.AssignableTypeFilter;

import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The error catalog is data: every {@link ErrorCode} constant has its text in all four bundles, no text is left
 * without a constant, and the wire codes look like codes. A new error that forgets its text fails here, not in production.
 */
class ErrorCatalogTest {

    private static final String[] BUNDLES = {"messages", "messages_en", "messages_ru", "messages_uk"};
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{(\\d+)");

    @Test
    void everyErrorConstantHasATextInEveryBundle() throws Exception {
        Set<String> keys = constantKeys();
        assertThat(keys).as("error enums found").hasSizeGreaterThan(400);
        List<String> missing = new ArrayList<>();
        for (String bundle : BUNDLES) {
            Properties p = load(bundle);
            for (String key : keys) {
                String text = p.getProperty(key);
                if (text == null || text.isBlank()) {
                    missing.add(bundle + ": " + key);
                }
            }
        }
        assertThat(missing).as("constants without a text").isEmpty();
    }

    @Test
    void noErrorTextWithoutAConstant() throws Exception {
        Set<String> keys = constantKeys();
        List<String> orphans = new ArrayList<>();
        for (String bundle : BUNDLES) {
            for (String key : load(bundle).stringPropertyNames()) {
                if (key.startsWith("error.") && !keys.contains(key)) {
                    orphans.add(bundle + ": " + key);
                }
            }
        }
        assertThat(orphans).as("texts nobody refers to").isEmpty();
    }

    @Test
    void aTextTakesTheSameArgumentsInEveryLanguage() throws Exception {
        Map<String, Properties> all = new TreeMap<>();
        for (String bundle : BUNDLES) {
            all.put(bundle, load(bundle));
        }
        List<String> mismatches = new ArrayList<>();
        for (String key : constantKeys()) {
            Set<Integer> base = placeholders(all.get("messages_ru").getProperty(key));
            for (String bundle : BUNDLES) {
                if (!placeholders(all.get(bundle).getProperty(key)).equals(base)) {
                    mismatches.add(bundle + ": " + key);
                }
            }
        }
        assertThat(mismatches).as("placeholders differ from the Russian text").isEmpty();
    }

    @Test
    void wireCodesAreUpperSnakeCaseOrAbsent() throws Exception {
        List<String> bad = new ArrayList<>();
        for (Class<?> type : errorEnums()) {
            for (Object c : type.getEnumConstants()) {
                String code = ((ErrorCode) c).code();
                if (code != null && !code.matches("[A-Z][A-Z0-9_]*")) {
                    bad.add(type.getSimpleName() + "." + c + " = " + code);
                }
            }
        }
        assertThat(bad).isEmpty();
    }

    private static Set<Integer> placeholders(String text) {
        Set<Integer> out = new TreeSet<>();
        Matcher m = PLACEHOLDER.matcher(text == null ? "" : text);
        while (m.find()) {
            out.add(Integer.parseInt(m.group(1)));
        }
        return out;
    }

    private static Set<String> constantKeys() throws Exception {
        Set<String> keys = new TreeSet<>();
        for (Class<?> type : errorEnums()) {
            for (Object c : type.getEnumConstants()) {
                keys.add(((ErrorCode) c).messageKey());
            }
        }
        return keys;
    }

    private static List<Class<?>> errorEnums() throws Exception {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AssignableTypeFilter(ErrorCode.class));
        List<Class<?>> out = new ArrayList<>();
        for (BeanDefinition d : scanner.findCandidateComponents("com.maxsolch.shop")) {
            Class<?> type = Class.forName(d.getBeanClassName());
            if (type.isEnum() && !type.getName().contains("Test")) {
                out.add(type);
            }
        }
        return out;
    }

    private static Properties load(String bundle) throws Exception {
        Properties p = new Properties();
        try (InputStreamReader in = new InputStreamReader(
                new ClassPathResource("i18n/" + bundle + ".properties").getInputStream(), StandardCharsets.UTF_8)) {
            p.load(in);
        }
        return p;
    }
}
