package com.maxsolch.shop.procurement.domain.supplyai;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The first real draft (08.11.2026, WESTLAB invoice): search found nothing for the glides and junk for the grip tape,
 * so the AI proposed two new products we already had. The lines are as the model read them on prod.
 */
class SupplyMatchWestLabTest {

    private static final CatalogItem DOTS_V2_BLACK = item("8cad1a34-f42c-442c-9511-44e363beb526",
            "Глайды WestLab Universal Dots V2 черные 30 шт.", false);
    private static final CatalogItem DOTS_BLUE = item("af69c4a5-61ea-4a80-b3b0-163000bbb52d",
            "Глайды WestLab Universal Dots синие", false);
    private static final CatalogItem DOTS_WHITE = item("b1e5d0c2-0000-4a80-b3b0-163000bbb52e",
            "Глайды WestLab Universal Dots белые", false);
    private static final CatalogItem GRIP = item("02520b5b-a520-4f92-8c6c-fa24bf9f66f3",
            "Грипсы WestLab Universal Grip Tape 0.2/0.55 мм", true);
    private static final CatalogItem MAT = new CatalogItem("c181fb2f-7c4c-42e6-b5af-d762a459247b",
            "Ковер STAR SHADOW 1", "Star", "c-mats", List.of(), null);
    private static final List<CatalogItem> CATALOG = List.of(DOTS_V2_BLACK, DOTS_BLUE, DOTS_WHITE, GRIP, MAT);

    private static final SourceLine L1 = new SourceLine("L1", "西城WESTLAB小圆点脚贴 鼠标", "6.5mm微扁平型小圆点脚贴 30颗",
            "WESTLAB small round-dot mouse feet, 6.5 mm ultra-flat round-dot feet, 30 pcs", "WESTLAB", null, null, 20, 8.96, null, null);
    private static final SourceLine L2 = new SourceLine("L2", "WEST LAB西城超薄聚氨酯防滑贴", "超薄聚氨酯防滑贴 1张",
            "WEST LAB ultra-thin polyurethane anti-slip pad, 1 sheet", "WEST LAB", null, null, 20, 7.4, null, null);
    private static final SourceLine L3 = new SourceLine("L3", "西城WESTLAB特氟龙UPE鼠标脚", "【滑】蓝色小圆点20粒[PTFE+降噪]",
            "WESTLAB Teflon UPE mouse feet, [Slippery] blue small round dots, 20 pcs [PTFE + noise reduction]", "WESTLAB",
            null, "blue", 50, 4.63, null, null);

    private static CatalogItem item(String id, String title, boolean hidden) {
        return new CatalogItem(id, title, "WestLab", "c-glides", List.of(), null, hidden);
    }

    private static List<String> ids(SourceLine l) {
        return SupplyMatcher.candidatesOf(l, CATALOG).stream().map(Candidate::productId).toList();
    }

    @Test
    void sizesAndPiecesAreNotModelCodes() {
        assertThat(ids(L1)).contains(DOTS_V2_BLACK.id(), DOTS_BLUE.id(), DOTS_WHITE.id()).doesNotContain(MAT.id());
    }

    @Test
    void brandWithASpaceAndAnEnglishGenericWordFindTheGripTape() {
        assertThat(ids(L2).get(0)).isEqualTo(GRIP.id());
    }

    @Test
    void colourPutsTheRightProductFirstButNineColoursAreNotConfident() {
        SupplyMatcher.Auto m = SupplyMatcher.autoMatch(L3, CATALOG, List.of());
        assertThat(m.candidates().get(0).productId()).isEqualTo(DOTS_BLUE.id());
        assertThat(m.decision().kind()).isEqualTo("open");
    }

    @Test
    void theWholeCatalogGoesToThePromptGroupedByCategoryWithHiddenMarked() {
        List<ReviewRow> rows = List.of(new ReviewRow(L1, LineDecision.open(), SupplyMatcher.candidatesOf(L1, CATALOG)));
        List<LeafCategory> cats = List.of(new LeafCategory("c-glides", "glaydy", "Глайды"), new LeafCategory("c-mats", "kovriki", "Коврики"));
        String prompt = MatchPrompt.build(rows, CATALOG, cats);
        assertThat(prompt).contains("### Глайды\n- " + MatchPrompt.shortId(DOTS_V2_BLACK.id()))
                .contains(MatchPrompt.shortId(GRIP.id()) + " | Грипсы WestLab Universal Grip Tape 0.2/0.55 мм | скрыт")
                .contains("### Коврики\n- " + MatchPrompt.shortId(MAT.id()) + " | Ковер STAR SHADOW 1");
        assertThat(prompt.indexOf("## Наш каталог")).isLessThan(prompt.indexOf("## Строки"));
    }

    @Test
    void anyCatalogProductIsAcceptedAndChooseKeepsTheLineOpenWithTheShortList() {
        String answer = "```json\n{\"L1\":{\"choose\":[\"" + MatchPrompt.shortId(DOTS_V2_BLACK.id()) + "\",\"pdeadbeef\"],"
                + "\"notes\":\"цвет не указан\"},\"L2\":{\"product\":\"" + MatchPrompt.shortId(GRIP.id()) + "\"}}\n```";
        List<ReviewRow> open = List.of(new ReviewRow(L1, LineDecision.open(), List.of()), new ReviewRow(L2, LineDecision.open(), List.of()));
        MatchPrompt.Result r = MatchPrompt.parse(answer, open, CATALOG, List.of());
        assertThat(r.decisions().get("L2")).isEqualTo(LineDecision.match(GRIP.id(), null, "ai"));
        assertThat(r.decisions()).doesNotContainKey("L1");
        assertThat(r.choices().get("L1")).containsExactly(DOTS_V2_BLACK.id());
        assertThat(r.notes().get("L1")).isEqualTo("цвет не указан");
        assertThat(r.errors()).containsExactly("L1: товара pdeadbeef нет в каталоге");
    }
}
