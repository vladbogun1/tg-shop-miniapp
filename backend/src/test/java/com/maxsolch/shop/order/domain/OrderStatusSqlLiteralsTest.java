package com.maxsolch.shop.order.domain;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SQL is a second place where order statuses are spelled out. Renaming or removing a status must
 * not leave a query that quietly matches nothing, and the "open" list must follow
 * {@link OrderTransitions#isOpen(OrderStatus)}.
 */
class OrderStatusSqlLiteralsTest {

    private static final Path MAIN = Path.of("src/main/java");

    /** {@code o.status = 'X'}, {@code o.status <> 'X'}, {@code o.status in ('X', 'Y')} (the alias of orders; other tables have their own `status`). */
    private static final Pattern STATUS_COMPARISON = Pattern.compile(
            "\\bo\\.status\\s*(?:=|<>|!=|in\\s*\\()\\s*((?:'[A-Z_]+'\\s*,?\\s*)+)");

    @Test
    void everyOrderStatusLiteralInSqlIsARealStatus() throws IOException {
        Set<String> valid = Arrays.stream(OrderStatus.values()).map(Enum::name).collect(Collectors.toSet());
        Set<String> unknown = new TreeSet<>();
        int seen = 0;
        try (Stream<Path> files = Files.walk(MAIN)) {
            for (Path file : files.filter(p -> p.toString().endsWith(".java")).toList()) {
                String source = Files.readString(file);
                if (!source.contains("from orders") && !source.contains("join orders")) {
                    continue;
                }
                Matcher m = STATUS_COMPARISON.matcher(source);
                while (m.find()) {
                    for (String literal : m.group(1).split(",")) {
                        String name = literal.trim().replace("'", "");
                        seen++;
                        if (!valid.contains(name)) {
                            unknown.add(file.getFileName() + ": " + name);
                        }
                    }
                }
            }
        }
        assertThat(seen).as("the scan found the status literals at all").isGreaterThan(5);
        assertThat(unknown).as("literals that are not an OrderStatus").isEmpty();
    }

    @Test
    void openSqlListFollowsIsOpen() {
        String expected = Arrays.stream(OrderStatus.values())
                .filter(OrderTransitions::isOpen)
                .map(s -> "'" + s.name() + "'")
                .collect(Collectors.joining(", "));
        assertThat(OrderTransitions.OPEN_SQL).isEqualTo(expected).isEqualTo("'NEW', 'APPROVED'");
    }

    @Test
    void deliveryEditableIsOpenOrShipped() {
        for (OrderStatus s : OrderStatus.values()) {
            assertThat(OrderTransitions.isDeliveryEditable(s))
                    .as(s.name())
                    .isEqualTo(s == OrderStatus.NEW || s == OrderStatus.APPROVED || s == OrderStatus.SHIPPED);
        }
    }
}
