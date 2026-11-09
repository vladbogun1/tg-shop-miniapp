package com.maxsolch.shop.procurement.domain.supplyai;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Screenshot overlaps are dropped by the total, never by look alone: two identical purchases on one screenshot stay,
 * an identical line on the next screenshot goes only when the total says it is a repeat.
 */
class SupplySeamsTest {

    static SourceLine line(String id, String text, String variant, int qty, double price) {
        return new SourceLine(id, text, variant, null, null, null, null, qty, price, null, null);
    }

    static ExtractedDoc doc(Double total, SourceLine... lines) {
        return new ExtractedDoc("Xraypad", "CNY", null, null, total, List.of(lines), null);
    }

    @Test
    void twoIdenticalPurchasesOnOneScreenshotBothStay() {
        ExtractedDoc d = doc(400.0, line("L1", "Origin Pro", "Soft", 1, 200), line("L2", "Origin Pro", "Soft", 1, 200));

        SupplySeams.Result r = SupplySeams.resolve(d, List.of(1, 1));

        assertThat(r.doc().lines()).hasSize(2);
        assertThat(r.removed()).isEmpty();
    }

    @Test
    void theOverlapOfTheNextScreenshotGoesWhenTheTotalSaysSo() {
        ExtractedDoc d = doc(300.0, line("L1", "Origin Pro", "Soft", 1, 200), line("L2", "Aqua", null, 1, 100),
                line("L3", "Aqua", null, 1, 100));

        SupplySeams.Result r = SupplySeams.resolve(d, List.of(1, 1, 2));

        assertThat(r.doc().lines()).extracting(SourceLine::id).containsExactly("L1", "L2");
        assertThat(r.shots()).containsExactly(1, 1);
        assertThat(r.removed()).containsExactly("Aqua — 1 × 100 (скрин 2)");
    }

    @Test
    void aSecondPurchaseOnTheNextScreenshotStaysWhenTheTotalNeedsIt() {
        ExtractedDoc d = doc(400.0, line("L1", "Origin Pro", "Soft", 1, 200), line("L2", "Aqua", null, 1, 100),
                line("L3", "Aqua", null, 1, 100));

        SupplySeams.Result r = SupplySeams.resolve(d, List.of(1, 1, 2));

        assertThat(r.doc().lines()).hasSize(3);
        assertThat(r.removed()).isEmpty();
    }

    @Test
    void withoutATotalTheRepeatOfThePreviousScreenshotGoes() {
        ExtractedDoc d = doc(null, line("L1", "Aqua", null, 1, 100), line("L2", "Aqua", null, 1, 100));

        assertThat(SupplySeams.resolve(d, List.of(1, 2)).doc().lines()).extracting(SourceLine::id).containsExactly("L1");
    }

    @Test
    void aLineTwoScreenshotsLaterIsNotAnOverlap() {
        ExtractedDoc d = doc(null, line("L1", "Aqua", null, 1, 100), line("L2", "Aqua", null, 1, 100));

        assertThat(SupplySeams.resolve(d, List.of(1, 3)).doc().lines()).hasSize(2);
    }

    @Test
    void unnumberedScreenshotsMakeAnyLaterTwinDoubtful() {
        ExtractedDoc d = doc(200.0, line("L1", "Aqua", null, 1, 100), line("L2", "Pan", null, 1, 100),
                line("L3", "Aqua", null, 1, 100));

        SupplySeams.Result r = SupplySeams.resolve(d, Arrays.asList(null, null, null));

        assertThat(r.doc().lines()).extracting(SourceLine::id).containsExactly("L1", "L2");
    }

    @Test
    void theClosestCombinationWinsAndOnATieTheBiggerOne() {
        assertThat(SupplySubsets.closest(1000, List.of(100.0, 250.0, 50.0), 700, -1)).containsExactlyInAnyOrder(1, 2);
        assertThat(SupplySubsets.closest(100, List.of(0.0, 50.0), 150, +1)).containsExactlyInAnyOrder(0, 1);
    }

    @Test
    void aRereadAddsOnlyTheLinesThatBringTheDraftToItsTotal() {
        List<SourceLine> have = List.of(line("L1", "Origin Pro", "Soft", 2, 200), line("L2", "Aqua", null, 1, 100));
        List<SourceLine> reread = List.of(line("X1", "Origin Pro", "Soft", 2, 200), line("X2", "Aqua", null, 1, 100),
                line("X3", "Origin Pro", "Xsoft · тубус", 3, 206.08), line("X4", "Sticker", null, 1, 5));

        List<SourceLine> found = SupplyVerify.missing(have, reread, 1118.24);

        assertThat(found).extracting(SourceLine::id).containsExactly("X3");
    }

    @Test
    void aRereadWithoutATotalAddsEverythingNew() {
        List<SourceLine> have = List.of(line("L1", "Aqua", null, 1, 100));
        List<SourceLine> reread = List.of(line("X1", "Aqua", null, 1, 100), line("X2", "Aqua", null, 1, 100));

        assertThat(SupplyVerify.missing(have, reread, null)).extracting(SourceLine::id).containsExactly("X2");
    }

    @Test
    void theReadingCloserToTheTotalIsKept() {
        ExtractedDoc first = doc(400.0, line("L1", "Aqua", null, 1, 100));
        ExtractedDoc second = doc(400.0, line("L1", "Aqua", null, 1, 100), line("L2", "Pan", null, 1, 300));

        assertThat(SupplyVerify.laterIsBetter(first, second)).isTrue();
        assertThat(SupplyVerify.laterIsBetter(second, first)).isFalse();
        assertThat(SupplyVerify.agrees(second, second.lines())).isTrue();
        assertThat(SupplyVerify.prompt(first, first.lines(), List.of(1))).contains("## Перепроверка", "Aqua | — | 1 × 100 | 1");
    }
}
