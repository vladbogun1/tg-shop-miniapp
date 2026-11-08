package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.ai.app.AiOutcome;
import com.maxsolch.shop.ai.app.AiServerJobs;
import com.maxsolch.shop.procurement.domain.supplyai.DraftState;
import com.maxsolch.shop.procurement.domain.supplyai.LineDecision;
import com.maxsolch.shop.procurement.domain.supplyai.NewProductDraft;
import com.maxsolch.shop.procurement.domain.supplyai.ReviewRow;
import com.maxsolch.shop.procurement.domain.supplyai.SourceLine;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/** The draft decides its AI tasks: «Принять» applies what became part of the batch, «Удалить» rejects everything. */
class SupplyDraftAiSettleTest {

    private final AiOutcome outcome = mock(AiOutcome.class);
    private final SupplyDraftAi ai = new SupplyDraftAi(mock(AiServerJobs.class), outcome);

    private static SourceLine line(String id) {
        return new SourceLine(id, "text " + id, null, null, null, null, null, 1, 1.0, null, null);
    }

    /** L1 stays a new product (its card is used), L2 was matched to our product after its card was made. */
    private static DraftState state() {
        DraftState s = new DraftState();
        s.setReadJob(10L);
        s.setMatchJob(11L);
        s.setRows(List.of(
                new ReviewRow(line("L1"), LineDecision.fresh(new NewProductDraft("Глайды X", "X", "c1", null, null)), List.of()),
                new ReviewRow(line("L2"), LineDecision.match("p-2", null, "admin"), List.of())));
        s.getCardJobs().put("L1", 20L);
        s.getCardJobs().put("L2", 21L);
        return s;
    }

    @Test
    void acceptedAppliesTheStepsAndTheCardsOfCreatedProductsOnly() {
        ai.settle(state(), true);
        verify(outcome).settle(List.of(10L, 11L, 20L), List.of(21L));
    }

    @Test
    void deletedRejectsEverything() {
        ai.settle(state(), false);
        verify(outcome).settle(List.of(), List.of(10L, 11L, 20L, 21L));
    }

    @Test
    void aDraftThatFailedBeforeMatchingHasOnlyItsReading() {
        DraftState s = new DraftState();
        s.setReadJob(10L);
        ai.settle(s, false);
        verify(outcome).settle(List.of(), List.of(10L));
    }
}
