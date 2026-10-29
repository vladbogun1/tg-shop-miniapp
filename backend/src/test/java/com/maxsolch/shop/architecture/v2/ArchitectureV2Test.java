package com.maxsolch.shop.architecture.v2;

import com.maxsolch.shop.architecture.v2.V2Rules.Violation;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Ratchet over the target architecture (docs/ARCHITECTURE.md; how to read it: docs/ARCHITECTURE-CHECKS.md).
 *
 * <p>Counts violations per rule and module ({@link V2Rules}), compares them with
 * {@code src/test/resources/architecture/v2-baseline.txt} and fails when any count is higher than recorded.
 * Lower counts are progress: the test prints that the baseline can go down. It also prints the summary table that
 * measures the migration (what is left per module). The baseline is only ever lowered:
 * {@code mvn test -Dtest=ArchitectureV2Test -Darchitecture.v2.update=true} rewrites it and refuses to raise a number.
 */
class ArchitectureV2Test {

    private static final String ROOT = "com.maxsolch.shop";
    private static final Path BASELINE = Path.of("src/test/resources/architecture/v2-baseline.txt");
    private static final Path SUMMARY = Path.of("target/architecture-v2-summary.txt");

    @Test
    void violationsDoNotGrowAndSummaryIsPrinted() throws IOException {
        JavaClasses classes = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages(ROOT);
        List<Violation> violations = new V2Rules(ROOT).evaluate(classes);
        Map<String, Integer> actual = count(violations);
        Map<String, Integer> baseline = readBaseline();

        String summary = summary(classes, actual);
        System.out.println(summary);
        Files.createDirectories(SUMMARY.getParent());
        Files.writeString(SUMMARY, summary, StandardCharsets.UTF_8);

        List<String> grew = new ArrayList<>();
        List<String> shrank = new ArrayList<>();
        Map<String, Integer> keys = new TreeMap<>(actual);
        baseline.keySet().forEach(k -> keys.putIfAbsent(k, 0));
        keys.forEach((key, now) -> {
            int was = baseline.getOrDefault(key, 0);
            if (now > was) {
                grew.add(key + ": " + was + " -> " + now + examples(violations, key));
            } else if (now < was) {
                shrank.add(key + ": " + was + " -> " + now);
            }
        });

        if (Boolean.getBoolean("architecture.v2.update")) {
            if (Files.exists(BASELINE)) {
                assertThat(grew).as("the baseline may only go down; fix the code for these").isEmpty();
            }
            writeBaseline(actual);
            return;
        }
        if (!shrank.isEmpty()) {
            System.out.println("ARCH v2: fewer violations than the baseline, lower it with "
                    + "-Darchitecture.v2.update=true and commit v2-baseline.txt:\n  " + String.join("\n  ", shrank));
        }
        assertThat(grew).as("new violations of the target architecture (rule module: baseline -> now); "
                + "fix the code, do not raise the baseline").isEmpty();
    }

    private static Map<String, Integer> count(List<Violation> violations) {
        Map<String, Integer> m = new TreeMap<>();
        for (Violation v : violations) {
            m.merge(v.rule() + " " + v.module(), 1, Integer::sum);
        }
        return m;
    }

    private static String examples(List<Violation> all, String key) {
        String[] parts = key.split(" ");
        String shown = all.stream().filter(v -> v.rule().equals(parts[0]) && v.module().equals(parts[1]))
                .map(Violation::key).sorted().limit(8).collect(Collectors.joining("\n      "));
        return "\n      " + shown + "\n      ...";
    }

    private static String summary(JavaClasses classes, Map<String, Integer> actual) {
        Placement placement = new Placement(ROOT);
        Map<String, Integer> classCount = new TreeMap<>();
        for (JavaClass c : classes) {
            if (placement.inProject(c) && c.getEnclosingClass().isEmpty()) {
                classCount.merge(placement.place(c).module(), 1, Integer::sum);
            }
        }
        List<String> modules = new ArrayList<>(Placement.REPORT_ORDER);
        classCount.keySet().stream().filter(m -> !modules.contains(m)).forEach(modules::add);

        StringBuilder sb = new StringBuilder("\n=== ARCHITECTURE v2: violations per rule (columns) and module (rows) ===\n");
        sb.append(String.format("%-13s %7s", "module", "classes"));
        V2Rules.RULES.keySet().forEach(r -> sb.append(String.format(" %4s", r)));
        sb.append(String.format(" %6s%n", "TOTAL"));
        int[] colTotals = new int[V2Rules.RULES.size()];
        int grand = 0;
        for (String module : modules) {
            int row = 0;
            StringBuilder cells = new StringBuilder();
            int i = 0;
            for (String rule : V2Rules.RULES.keySet()) {
                int n = actual.getOrDefault(rule + " " + module, 0);
                cells.append(String.format(" %4s", n == 0 ? "." : String.valueOf(n)));
                colTotals[i++] += n;
                row += n;
            }
            grand += row;
            if (row > 0 || classCount.getOrDefault(module, 0) > 0) {
                sb.append(String.format("%-13s %7d%s %6d%n", module, classCount.getOrDefault(module, 0), cells, row));
            }
        }
        sb.append(String.format("%-13s %7s", "TOTAL", ""));
        for (int t : colTotals) {
            sb.append(String.format(" %4d", t));
        }
        sb.append(String.format(" %6d%n", grand));
        int legacy = classCount.getOrDefault(Placement.LEGACY, 0);
        int all = classCount.values().stream().mapToInt(Integer::intValue).sum();
        sb.append(String.format("migrated classes: %d of %d (legacy left: %d)%n", all - legacy, all, legacy));
        sb.append("rules:\n");
        V2Rules.RULES.forEach((id, text) -> sb.append("  ").append(id).append("  ").append(text).append('\n'));
        return sb.toString();
    }

    private static Map<String, Integer> readBaseline() throws IOException {
        Map<String, Integer> m = new TreeMap<>();
        if (!Files.exists(BASELINE)) {
            return m;
        }
        for (String line : Files.readAllLines(BASELINE, StandardCharsets.UTF_8)) {
            String t = line.trim();
            if (t.isEmpty() || t.startsWith("#")) {
                continue;
            }
            String[] p = t.split("\\s+");
            m.put(p[0] + " " + p[1], Integer.parseInt(p[2]));
        }
        return m;
    }

    private static void writeBaseline(Map<String, Integer> actual) throws IOException {
        StringBuilder sb = new StringBuilder("""
                # ArchUnit v2 ratchet: violations of the target architecture per rule and module (docs/ARCHITECTURE-CHECKS.md).
                # Format: <rule> <module> <count>. Numbers only go DOWN: regenerate with
                #   mvn -B -ntp test -Dtest=ArchitectureV2Test -Darchitecture.v2.update=true
                # after fixing violations; a raised number means the code got worse and the change must be redone.
                """);
        actual.forEach((key, n) -> sb.append(key).append(' ').append(n).append('\n'));
        Files.writeString(BASELINE, sb.toString(), StandardCharsets.UTF_8);
    }
}
