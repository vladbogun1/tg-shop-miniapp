package com.maxsolch.shop.procurement.domain.supplyai;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static com.maxsolch.shop.procurement.domain.supplyai.Fx.CATALOG;
import static com.maxsolch.shop.procurement.domain.supplyai.Fx.CATS;
import static com.maxsolch.shop.procurement.domain.supplyai.Fx.SLEEVE;
import static com.maxsolch.shop.procurement.domain.supplyai.Fx.ZP1_BLACK;
import static com.maxsolch.shop.procurement.domain.supplyai.Fx.ZP2;
import static org.assertj.core.api.Assertions.assertThat;

/** Matching, step 2 prompt/answer and the final plan. Ported from ai.test.ts, ai-fixes.test.ts, match-subject.test.ts. */
class SupplyMatchTest {

    private final List<SourceLine> lines = SupplyExtract.parse(Fx.TAOBAO).doc().lines();

    @Test
    void findsTheSameModelCodeAndColourNotANeighbour() {
        SupplyMatcher.Auto m = SupplyMatcher.autoMatch(lines.get(0), CATALOG, List.of());
        assertThat(m.decision().kind()).isEqualTo("match");
        assertThat(m.decision().productId()).isEqualTo(ZP1_BLACK.id());
        assertThat(m.decision().by()).isEqualTo("search");
    }

    @Test
    void productWithVariantsIsNotAcceptedWithoutAGuessedVariant() {
        SourceLine l = lines.get(1);
        SourceLine noEn = new SourceLine(l.id(), l.text(), "单只", null, l.brand(), l.model(), l.color(), l.qty(),
                l.unitPrice(), l.lineTotal(), l.notes());
        SupplyMatcher.Auto m = SupplyMatcher.autoMatch(noEn, CATALOG, List.of());
        assertThat(m.decision().kind()).isEqualTo("open");
        assertThat(m.candidates().get(0).productId()).isEqualTo(SLEEVE.id());
    }

    @Test
    void supplierMemoryBeatsSearch() {
        List<SupplierAlias> memory = List.of(new SupplierAlias("zpmax准枪zp3速度电竞fps | zp3 山青色 490*420*4mm", ZP2.id(), null));
        SupplyMatcher.Auto m = SupplyMatcher.autoMatch(lines.get(3), CATALOG, memory);
        assertThat(m.decision()).isEqualTo(LineDecision.match(ZP2.id(), null, "memory"));
    }

    @Test
    void applyMemoryReplacesOpenAndSearchRowsOnly() {
        List<SupplierAlias> memory = List.of(new SupplierAlias(SupplyText.sourceKey(lines.get(3).text(), lines.get(3).variant()), ZP2.id(), null));
        List<ReviewRow> rows = List.of(Fx.row(lines.get(3), LineDecision.open()),
                Fx.row(lines.get(3), LineDecision.match(SLEEVE.id(), "v-m", "admin")));
        List<ReviewRow> out = SupplyMatcher.applyMemory(rows, memory, CATALOG);
        assertThat(out.get(0).decision().by()).isEqualTo("memory");
        assertThat(out.get(1).decision().by()).isEqualTo("admin");
    }

    private List<ReviewRow> openRows() {
        return SupplyMatcher.autoMatch(lines, CATALOG).stream().map(r -> Fx.row(r.line(), LineDecision.open()))
                .map(r -> new ReviewRow(r.line(), r.decision(), SupplyMatcher.candidatesOf(r.line(), CATALOG))).toList();
    }

    @Test
    void promptHasOnlyPassedLinesAndTheirCandidates() {
        String prompt = MatchPrompt.build(List.of(openRows().get(1)), CATALOG, CATS);
        assertThat(prompt).contains("L2").contains(MatchPrompt.shortId(SLEEVE.id())).doesNotContain("### L1");
    }

    @Test
    void parsesProductPlusVariantAndNewProduct() {
        String answer = "```json\n{\"L2\":{\"product\":\"" + MatchPrompt.shortId(SLEEVE.id()) + "\",\"variant\":\"xl\"},"
                + "\"L4\":{\"new\":{\"title\":\"Коврик Zpmax ZP3 490×420 бирюзовый\",\"brand\":\"Zpmax\",\"category\":\"kovriki\",\"variant\":null}},"
                + "\"L9\":{\"product\":\"pdeadbeef\"}}\n```";
        MatchPrompt.Result a = MatchPrompt.parse(answer, List.of(), CATALOG, CATS);
        assertThat(a.decisions().get("L2")).isEqualTo(LineDecision.match(SLEEVE.id(), "v-xl", "ai"));
        assertThat(a.decisions().get("L4").kind()).isEqualTo("new");
        assertThat(a.decisions().get("L4").draft().categoryId()).isEqualTo("c-mats");
        assertThat(a.errors()).hasSize(1);
    }

    @Test
    void answersForLinesOutsideOpenRowsAreRejected() {
        String answer = "{\"L1\":{\"new\":{\"title\":\"X\"}},\"L2\":{\"new\":{\"title\":\"Y\"}}}";
        MatchPrompt.Result a = MatchPrompt.parse(answer, List.of(openRows().get(1)), CATALOG, CATS);
        assertThat(a.decisions()).containsOnlyKeys("L2");
        assertThat(a.errors()).containsExactly("L1: такой строки нет среди нерешённых");
    }

    @Test
    void notesComeBackByLineEvenWithoutADecision() {
        MatchPrompt.Result a = MatchPrompt.parse(
                "```json\n{\"l2\": {\"new\": {\"title\": \"Глайды X\"}, \"notes\": \"не уверен в цвете\"}}\n```", List.of(), List.of(), List.of());
        assertThat(a.decisions().get("L2")).isEqualTo(LineDecision.fresh(new NewProductDraft("Глайды X", null, null, null, null)));
        assertThat(a.notes().get("L2")).isEqualTo("не уверен в цвете");
    }

    @Test
    void subjectIsStableAndSensitiveToTheSet() {
        ReviewRow a = Fx.row(sl("L1", "A", null), LineDecision.open());
        ReviewRow b = Fx.row(sl("L2", "B", null), LineDecision.open());
        String all = MatchPrompt.subject(List.of(a, b));
        assertThat(all).isEqualTo(MatchPrompt.subject(List.of(a, b))).matches("^m[0-9a-f]{16}$");
        assertThat(MatchPrompt.subject(List.of(b))).isNotEqualTo(all);
        assertThat(MatchPrompt.subject(List.of(a, Fx.row(sl("L2", "B", "red"), LineDecision.open())))).isNotEqualTo(all);
    }

    private static SourceLine sl(String id, String text, String variant) {
        return new SourceLine(id, text, variant, null, null, null, null, 1, 1.0, 1.0, null);
    }

    @Test
    void mergesSamePositionsAndGroupsNewProductsByTitle() {
        List<ReviewRow> rows = openRows();
        NewProductDraft zp3 = new NewProductDraft("Коврик Zpmax ZP3", "Zpmax", null, null, null);
        List<ReviewRow> decided = List.of(
                Fx.row(rows.get(1).line(), LineDecision.match(SLEEVE.id(), "v-xl", "admin")),
                Fx.row(rows.get(2).line(), LineDecision.match(SLEEVE.id(), "v-xl", "admin")),
                Fx.row(rows.get(3).line(), LineDecision.fresh(zp3)),
                Fx.row(rows.get(0).line(), LineDecision.skip()));
        List<SupplyPlan.NewProduct> plans = SupplyPlan.newProducts(decided);
        assertThat(plans).hasSize(1);
        assertThat(SupplyPlan.problems(decided, plans, Map.of())).containsExactly(
                "«Коврик Zpmax ZP3»: выберите категорию", "«Коврик Zpmax ZP3»: черновая цена продажи");
        Map<String, SupplyPlan.Created> created = Map.of(plans.get(0).key(), new SupplyPlan.Created("new-zp3", List.of()));
        assertThat(SupplyPlan.mergeLines(SupplyPlan.resolvedLines(decided, created))).containsExactly(
                new SupplyPlan.MergedLine(SLEEVE.id(), "v-xl", 6, 43.9),
                new SupplyPlan.MergedLine("new-zp3", null, 4, 134.67));
        assertThat(SupplyPlan.aliasesOf(SupplyPlan.resolvedLines(decided, created))).hasSize(3);
    }

    @Test
    void positionWithAnUnpricedLineHasNoPrice() {
        List<SupplyPlan.MergedLine> merged = SupplyPlan.mergeLines(List.of(
                new SupplyPlan.Resolved(Fx.line("L1", 5, 10.0), "p", null),
                new SupplyPlan.Resolved(Fx.line("L2", 5, null), "p", null)));
        assertThat(merged).containsExactly(new SupplyPlan.MergedLine("p", null, 10, null));
    }

    @Test
    void newProductWithVariants() {
        List<ReviewRow> rows = List.of(Fx.row(Fx.line("L1"), draft(null, "M")), Fx.row(Fx.line("L2"), draft(null, null)));
        List<SupplyPlan.NewProduct> plans = SupplyPlan.newProducts(rows);
        assertThat(plans.get(0).variants()).containsExactly("M", "L2");     // another position gets its own words
        assertThat(SupplyPlan.problems(rows, plans, Map.of("рукав x", 100.0))).isEmpty();

        List<ReviewRow> ok = List.of(rows.get(0), Fx.row(Fx.line("L2"), draft(null, "XL")));
        List<SupplyPlan.NewProduct> okPlans = SupplyPlan.newProducts(ok);
        Map<String, SupplyPlan.Created> created = Map.of("рукав x",
                new SupplyPlan.Created("p1", List.of(new CatalogItem.Variant("v1", "M"))));
        assertThat(SupplyPlan.variantSetProblems(okPlans, created)).containsExactly(
                "«Рукав X» уже создан с вариантами M — нет варианта XL. Верните варианты или закройте окно и начните заново");
        assertThat(SupplyPlan.variantSetProblems(okPlans, Map.of())).isEmpty();
    }

    private static LineDecision draft(String category, String variant) {
        return LineDecision.fresh(new NewProductDraft("Рукав X", null, "c", variant, null));
    }

    @Test
    void draftPrice() {
        assertThat(SupplyPlan.draftPriceUah(134.67, 5.5)).isEqualTo(1480.0);
        assertThat(SupplyPlan.draftPriceUah(0.5, 5.5)).isEqualTo(10.0);
        assertThat(SupplyPlan.draftPriceUah(null, 5.5)).isNull();
        assertThat(SupplyPlan.draftPriceUah(10.0, 0.0)).isNull();
    }
}
