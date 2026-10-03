package com.maxsolch.shop.service;

import com.maxsolch.shop.service.CartRules.Line;
import com.maxsolch.shop.service.CartRules.LineKey;
import com.maxsolch.shop.web.dto.CartDtos.CartLineInput;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class CartRulesTest {

    private static final String P1 = UUID.randomUUID().toString();
    private static final String P2 = UUID.randomUUID().toString();
    private static final String V1 = UUID.randomUUID().toString();

    @Test
    void normalize_sumsDuplicates_clampsQuantity_dropsJunk() {
        List<Line> lines = CartRules.normalize(List.of(
                new CartLineInput(P1, null, 2),
                new CartLineInput(P1.toUpperCase(), "", 3),     // same line: case + blank variant
                new CartLineInput(P2, V1, 500),                 // clamped to 99
                new CartLineInput("not-a-uuid", null, 1),       // dropped
                new CartLineInput(P2, "bad", 1),                // bad variant id → dropped
                new CartLineInput(P2, null, 0),                 // non-positive → dropped
                new CartLineInput(null, null, 1)));

        assertThat(lines).containsExactly(
                new Line(new LineKey(P1, null), 5),
                new Line(new LineKey(P2, V1), CartRules.MAX_QUANTITY));
    }

    @Test
    void merge_sameLine_takesTheLargerQuantity_neverDuplicates() {
        List<Line> server = List.of(new Line(new LineKey(P1, null), 2), new Line(new LineKey(P2, V1), 1));
        List<Line> guest = List.of(new Line(new LineKey(P2, V1), 3), new Line(new LineKey(P1, null), 1));

        List<Line> merged = CartRules.merge(server, guest);

        assertThat(merged).containsExactly(
                new Line(new LineKey(P1, null), 2),
                new Line(new LineKey(P2, V1), 3));
    }

    @Test
    void merge_isIdempotent() {
        List<Line> server = List.of(new Line(new LineKey(P1, null), 2));
        List<Line> guest = List.of(new Line(new LineKey(P1, null), 1), new Line(new LineKey(P2, null), 4));

        List<Line> once = CartRules.merge(server, guest);
        List<Line> twice = CartRules.merge(once, guest);

        assertThat(twice).isEqualTo(once);
    }

    @Test
    void merge_appendsNewGuestLinesAfterAccountLines() {
        List<Line> server = List.of(new Line(new LineKey(P1, null), 1));
        List<Line> guest = List.of(new Line(new LineKey(P2, V1), 2));

        assertThat(CartRules.merge(server, guest)).extracting(l -> l.key().productId())
                .containsExactly(P1, P2);
    }

    @Test
    void merge_capsLineCount_droppingOnlyNewGuestLines() {
        List<Line> server = new ArrayList<>();
        for (int i = 0; i < CartRules.MAX_LINES; i++) {
            server.add(new Line(new LineKey(UUID.randomUUID().toString(), null), 1));
        }
        LineKey existing = server.get(0).key();
        List<Line> guest = List.of(
                new Line(new LineKey(P1, null), 1),          // new → no room
                new Line(existing, 7));                      // already there → still merged

        List<Line> merged = CartRules.merge(server, guest);

        assertThat(merged).hasSize(CartRules.MAX_LINES);
        assertThat(merged).noneMatch(l -> l.key().productId().equals(P1));
        assertThat(merged.get(0)).isEqualTo(new Line(existing, 7));
    }
}
