package com.maxsolch.shop.order.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link OrderTransitions} against {@code order/transition-vectors.json}, every pair of statuses. The core package
 * (orders.test.ts) runs the same file against its table, so the client and the server cannot disagree.
 */
class OrderTransitionsVectorsTest {

    @TestFactory
    Stream<DynamicTest> everyPair() throws Exception {
        JsonNode root;
        try (InputStream in = getClass().getResourceAsStream("/order/transition-vectors.json")) {
            root = new ObjectMapper().readTree(in);
        }
        List<DynamicTest> tests = new ArrayList<>();
        for (OrderStatus from : OrderStatus.values()) {
            JsonNode targets = root.get("allowed").get(from.name());
            for (OrderStatus to : OrderStatus.values()) {
                boolean expected = false;
                for (JsonNode t : targets) {
                    expected |= t.asText().equals(to.name());
                }
                boolean exp = expected;
                tests.add(DynamicTest.dynamicTest(from + " -> " + to,
                        () -> assertThat(OrderTransitions.allowed(from, to)).isEqualTo(exp)));
            }
        }
        return tests.stream();
    }

    @org.junit.jupiter.api.Test
    void theFileListsEveryStatus() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/order/transition-vectors.json")) {
            JsonNode statuses = new ObjectMapper().readTree(in).get("statuses");
            List<String> names = new ArrayList<>();
            statuses.forEach(s -> names.add(s.asText()));
            assertThat(names).containsExactlyInAnyOrder(
                    java.util.Arrays.stream(OrderStatus.values()).map(Enum::name).toArray(String[]::new));
        }
    }
}
