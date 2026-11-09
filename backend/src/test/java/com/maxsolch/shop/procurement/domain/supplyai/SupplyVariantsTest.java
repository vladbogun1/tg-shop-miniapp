package com.maxsolch.shop.procurement.domain.supplyai;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Lines of one new product: the same position adds up without a variant, different positions get the words that
 * tell them apart, the admin's variant wins. Same cases as variants.test.ts.
 */
class SupplyVariantsTest {

    static ReviewRow row(String id, String text, String variant, String en, String chosen) {
        SourceLine l = new SourceLine(id, text, variant, en, null, null, null, 1, 200.0, null, null);
        return new ReviewRow(l, LineDecision.fresh(new NewProductDraft("X-raypad Origin Pro black", "X-raypad", "c", chosen, null)), List.of());
    }

    static final ReviewRow SOFT = row("L1", "X-raypad Origin Pro 鼠标垫", "Soft 黑色", "Origin Pro mouse pad, black, Soft", null);
    static final ReviewRow SOFT_TUBE = row("L2", "X-raypad Origin Pro 鼠标垫", "Soft 黑色 礼盒装", "Origin Pro mouse pad, black, Soft, gift tube packaging", null);
    static final ReviewRow XSOFT = row("L3", "X-raypad Origin Pro 鼠标垫", "XSoft 黑色", "Origin Pro mouse pad, black, XSoft", null);

    @Test
    void differentPositionsGetTheWordsThatTellThemApart() {
        Map<String, String> v = SupplyVariants.of(List.of(SOFT, SOFT_TUBE, XSOFT));

        assertThat(v).containsEntry("L1", "Soft").containsEntry("L2", "Soft gift tube packaging").containsEntry("L3", "XSoft");
        assertThat(SupplyPlan.newProducts(List.of(SOFT, SOFT_TUBE, XSOFT)).get(0).variants())
                .containsExactly("Soft", "Soft gift tube packaging", "XSoft");
    }

    @Test
    void theSamePositionTwiceHasNoVariantAndAddsUp() {
        ReviewRow again = row("L4", SOFT.line().text(), SOFT.line().variant(), SOFT.line().en(), null);

        assertThat(SupplyVariants.of(List.of(SOFT, again))).isEmpty();
        assertThat(SupplyPlan.problems(List.of(SOFT, again), SupplyPlan.newProducts(List.of(SOFT, again)),
                Map.of("x-raypad origin pro black", 1000.0))).isEmpty();
    }

    @Test
    void theAdminsVariantWinsAndCoversTheSamePosition() {
        ReviewRow named = row("L1", SOFT.line().text(), SOFT.line().variant(), SOFT.line().en(), "Soft");
        ReviewRow again = row("L4", SOFT.line().text(), SOFT.line().variant(), SOFT.line().en(), null);
        ReviewRow tube = row("L2", SOFT_TUBE.line().text(), SOFT_TUBE.line().variant(), SOFT_TUBE.line().en(), "Soft · тубус");

        assertThat(SupplyVariants.of(List.of(named, again, tube)))
                .containsEntry("L1", "Soft").containsEntry("L4", "Soft").containsEntry("L2", "Soft · тубус");
    }

    @Test
    void wordsThatClashWithAnotherPositionGetTheLineNumber() {
        ReviewRow a = row("L1", "Pad A", null, "pad black", null);
        ReviewRow b = row("L2", "Pad B", null, "pad black", null);

        assertThat(SupplyVariants.of(List.of(a, b))).containsEntry("L1", "L1").containsEntry("L2", "L2");
    }

    @Test
    void createdProductsResolveLinesToTheirVariants() {
        Map<String, SupplyPlan.Created> created = Map.of("x-raypad origin pro black", new SupplyPlan.Created("p1",
                List.of(new CatalogItem.Variant("v1", "Soft"), new CatalogItem.Variant("v2", "Soft gift tube packaging"),
                        new CatalogItem.Variant("v3", "XSoft"))));

        assertThat(SupplyPlan.resolvedLines(List.of(SOFT, SOFT_TUBE, XSOFT), created))
                .extracting(SupplyPlan.Resolved::variantId).containsExactly("v1", "v2", "v3");
    }
}
