package com.maxsolch.shop.architecture;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The shop's zone comes from {@code app.timezone}; the only place that may spell out the default is
 * {@code AppProperties.DEFAULT_TIMEZONE}. A second literal would silently ignore the setting.
 */
class ShopZoneLiteralTest {

    private static final Path MAIN = Path.of("src/main/java");
    private static final String ALLOWED = "AppProperties.java";

    @Test
    void zoneNameIsNotHardCodedOutsideAppProperties() throws IOException {
        try (Stream<Path> files = Files.walk(MAIN)) {
            List<String> offenders = files
                    .filter(p -> p.toString().endsWith(".java") && !p.getFileName().toString().equals(ALLOWED))
                    .flatMap(ShopZoneLiteralTest::literalLines)
                    .toList();
            assertThat(offenders).as("Europe/Kyiv literal in code (use ShopZone / app.timezone)").isEmpty();
        }
    }

    private static Stream<String> literalLines(Path p) {
        try {
            List<String> lines = Files.readAllLines(p);
            return Stream.iterate(0, i -> i < lines.size(), i -> i + 1)
                    .filter(i -> {
                        String t = lines.get(i).trim();
                        return t.contains("Europe/Kyiv") && !t.startsWith("*") && !t.startsWith("//")
                                && !t.startsWith("/*");
                    })
                    .map(i -> p + ":" + (i + 1));
        } catch (IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
    }
}
