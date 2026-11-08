package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.procurement.domain.SupplyDraft;
import com.maxsolch.shop.procurement.domain.supplyai.DraftState;
import com.maxsolch.shop.procurement.domain.supplyai.LineDecision;
import com.maxsolch.shop.procurement.domain.supplyai.NewProductDraft;
import com.maxsolch.shop.procurement.domain.supplyai.ReviewRow;
import com.maxsolch.shop.procurement.domain.supplyai.SourceLine;
import com.maxsolch.shop.procurement.infra.SupplyDraftRepository;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Names of the draft tasks in «ИИ-задачи → История»: the draft, its title and the step; a deleted draft by number. */
class SupplyDraftSubjectLabelsTest {

    private final SupplyDraftRepository repo = mock(SupplyDraftRepository.class);
    private final SupplyDraftJson json = new SupplyDraftJson();
    private final SupplyDraftSubjectLabels labels = new SupplyDraftSubjectLabels(repo, json);

    private SupplyDraft draft() {
        DraftState s = new DraftState();
        s.setRows(List.of(
                new ReviewRow(new SourceLine("L1", "t", null, null, null, null, null, 1, 1.0, null, null),
                        LineDecision.fresh(new NewProductDraft("Глайды X", "X", "c1", null, null)), List.of()),
                new ReviewRow(new SourceLine("L2", "t", null, null, null, null, null, 1, 1.0, null, null),
                        LineDecision.match("p-2", null, "admin"), List.of())));
        SupplyDraft d = mock(SupplyDraft.class);
        when(d.getId()).thenReturn(12L);
        when(d.getTitle()).thenReturn("WESTLAB");
        when(d.getState()).thenReturn(json.write(s));
        return d;
    }

    @Test
    void eachStepIsNamedWithTheDraftAndItsTitle() {
        SupplyDraft d = draft();
        when(repo.findAllById(any())).thenReturn(List.of(d));

        Map<String, String> out = labels.labels(List.of("d12-read", "d12-match", "d12-c-L1", "d12-c-L2", "d99-read", "junk"));

        assertThat(out).containsEntry("d12-read", "Черновик поставки №12 · WESTLAB · чтение накладной")
                .containsEntry("d12-match", "Черновик поставки №12 · WESTLAB · сопоставление")
                .containsEntry("d12-c-L1", "Черновик поставки №12 · WESTLAB · карточка «Глайды X»")
                .containsEntry("d12-c-L2", "Черновик поставки №12 · WESTLAB · карточка")
                .containsEntry("d99-read", "Черновик поставки №99 (удалён) · чтение накладной")
                .doesNotContainKey("junk");
    }
}
