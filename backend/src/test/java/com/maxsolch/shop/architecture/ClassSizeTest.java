package com.maxsolch.shop.architecture;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * No source file in src/main/java may be longer than {@value #MAX_LINES} lines - no exceptions, no list of
 * grandfathered files. A big class is where the next feature lands "for now": split it by responsibility.
 * See docs/ARCHITECTURE-CHECKS.md.
 */
class ClassSizeTest {

    private static final int MAX_LINES = 400;
    private static final Path SOURCES = Path.of("src/main/java");

    @Test
    void sourceFilesStayWithinSizeLimit() throws IOException {
        List<String> problems = new ArrayList<>();
        try (Stream<Path> files = Files.walk(SOURCES)) {
            for (Path file : (Iterable<Path>) files.filter(p -> p.toString().endsWith(".java"))::iterator) {
                try (Stream<String> lines = Files.lines(file, StandardCharsets.UTF_8)) {
                    long count = lines.count();
                    if (count > MAX_LINES) {
                        problems.add(SOURCES.relativize(file).toString().replace('\\', '/') + ": " + count
                                + " lines, limit is " + MAX_LINES + " - split it by responsibility");
                    }
                }
            }
        }
        assertThat(problems).as("source files over the size limit").isEmpty();
    }
}
