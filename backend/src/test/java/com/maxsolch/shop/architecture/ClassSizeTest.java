package com.maxsolch.shop.architecture;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * No source file in src/main/java may be longer than {@value #MAX_LINES} lines. Files that were already bigger are
 * listed in architecture/large-classes.txt with their size at that time and may grow by at most 5 % of it:
 * a big class is where the next feature lands "for now", so it must not keep growing. See docs/ARCHITECTURE-CHECKS.md.
 */
class ClassSizeTest {

    private static final int MAX_LINES = 500;
    private static final double GROWTH_ALLOWANCE = 1.05;
    private static final Path SOURCES = Path.of("src/main/java");
    private static final String BASELINE = "/architecture/large-classes.txt";

    @Test
    void sourceFilesStayWithinSizeLimit() throws IOException {
        Map<String, Integer> baseline = readBaseline();
        Map<String, Integer> actual = countLines();
        List<String> problems = new ArrayList<>();

        actual.forEach((file, lines) -> {
            Integer frozen = baseline.get(file);
            if (frozen == null && lines > MAX_LINES) {
                problems.add(file + ": " + lines + " lines, limit is " + MAX_LINES
                        + " — split it by responsibility instead of adding to large-classes.txt");
            } else if (frozen != null && lines > allowed(frozen)) {
                problems.add(file + ": " + lines + " lines, frozen at " + frozen + " (+5 % = " + allowed(frozen)
                        + ") — move the new logic into its own class");
            }
        });
        baseline.keySet().stream()
                .filter(file -> !actual.containsKey(file))
                .forEach(file -> problems.add(file + ": listed in large-classes.txt but no longer exists — remove the line"));

        assertThat(problems).as("source files over the size limit").isEmpty();
    }

    private static int allowed(int frozen) {
        return (int) Math.floor(frozen * GROWTH_ALLOWANCE);
    }

    private static Map<String, Integer> countLines() throws IOException {
        Map<String, Integer> result = new TreeMap<>();
        try (Stream<Path> files = Files.walk(SOURCES)) {
            for (Path file : (Iterable<Path>) files.filter(p -> p.toString().endsWith(".java"))::iterator) {
                String relative = SOURCES.relativize(file).toString().replace('\\', '/');
                try (Stream<String> lines = Files.lines(file, StandardCharsets.UTF_8)) {
                    result.put(relative, (int) lines.count());
                }
            }
        }
        return result;
    }

    private static Map<String, Integer> readBaseline() throws IOException {
        Map<String, Integer> result = new TreeMap<>();
        try (InputStream in = ClassSizeTest.class.getResourceAsStream(BASELINE)) {
            assertThat(in).as(BASELINE + " on the test classpath").isNotNull();
            for (String line : new String(in.readAllBytes(), StandardCharsets.UTF_8).split("\\R")) {
                String trimmed = line.strip();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                    continue;
                }
                String[] parts = trimmed.split("\\s+");
                result.put(parts[0], Integer.parseInt(parts[1]));
            }
        }
        return result;
    }
}
