package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.DraftSaveRequest;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.ManualLine;
import com.maxsolch.shop.procurement.domain.supplyai.DraftState;
import com.maxsolch.shop.procurement.domain.supplyai.LineDecision;
import com.maxsolch.shop.procurement.domain.supplyai.ReviewRow;
import com.maxsolch.shop.procurement.domain.supplyai.SourceLine;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Lines the reading missed are added by hand (open, «M…»); an overlap the code kept is taken out of the document. */
class SupplyDraftEditsTest {

    static DraftState state() {
        DraftState s = new DraftState();
        SourceLine l1 = new SourceLine("L1", "Aqua", null, null, null, null, null, 1, 100.0, null, null);
        SourceLine m1 = new SourceLine("M1", "Pan", null, null, null, null, null, 1, 50.0, null, null);
        s.setRows(new ArrayList<>(List.of(new ReviewRow(l1, LineDecision.skip(), List.of()),
                new ReviewRow(m1, LineDecision.open(), List.of()))));
        s.getLineNotes().put("L1", "повтор?");
        return s;
    }

    static DraftSaveRequest req(List<ManualLine> add, List<String> remove) {
        return new DraftSaveRequest(0, null, null, null, null, null, null, null, null, null, null, add, remove);
    }

    @Test
    void addsOpenLinesAfterTheLastManualOne() {
        DraftState s = state();

        SupplyDraftEdits.apply(s, req(List.of(new ManualLine(" Origin Pro ", "Xsoft · тубус", 3, 206.08)), null));

        ReviewRow added = s.getRows().get(2);
        assertThat(added.line().id()).isEqualTo("M2");
        assertThat(added.line().text()).isEqualTo("Origin Pro");
        assertThat(added.line().lineTotal()).isEqualTo(618.24);
        assertThat(added.decision().kind()).isEqualTo("open");
    }

    @Test
    void takesLinesOutOfTheDocument() {
        DraftState s = state();

        SupplyDraftEdits.apply(s, req(null, List.of("L1")));

        assertThat(s.getRows()).extracting(r -> r.line().id()).containsExactly("M1");
        assertThat(s.getLineNotes()).doesNotContainKey("L1");
    }

    @Test
    void refusesABrokenManualLine() {
        assertThatThrownBy(() -> SupplyDraftEdits.apply(state(), req(List.of(new ManualLine(" ", null, 1, 1.0)), null)))
                .isInstanceOf(DomainException.class);
        assertThatThrownBy(() -> SupplyDraftEdits.apply(state(), req(List.of(new ManualLine("Aqua", null, 0, 1.0)), null)))
                .isInstanceOf(DomainException.class);
        assertThatThrownBy(() -> SupplyDraftEdits.apply(state(), req(List.of(new ManualLine("Aqua", null, 1, -1.0)), null)))
                .isInstanceOf(DomainException.class);
    }

    @Test
    void theOlderRequestShapeChangesNoLines() {
        DraftState s = state();

        SupplyDraftEdits.apply(s, new DraftSaveRequest(0, Map.of(), null, null, null, null, null, null, "Xraypad", null, null));

        assertThat(s.getRows()).hasSize(2);
        assertThat(s.getTitle()).isEqualTo("Xraypad");
    }
}
