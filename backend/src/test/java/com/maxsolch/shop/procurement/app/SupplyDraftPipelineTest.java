package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.catalog.app.CardDraft;
import com.maxsolch.shop.catalog.app.NewProductCards;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.procurement.domain.SupplyDraft;
import com.maxsolch.shop.procurement.domain.SupplyDraftEvents;
import com.maxsolch.shop.procurement.domain.supplyai.CatalogItem;
import com.maxsolch.shop.procurement.domain.supplyai.DraftState;
import com.maxsolch.shop.procurement.domain.supplyai.LeafCategory;
import com.maxsolch.shop.procurement.domain.supplyai.LineDecision;
import com.maxsolch.shop.procurement.domain.supplyai.ReviewRow;
import com.maxsolch.shop.procurement.domain.supplyai.SourceLine;
import com.maxsolch.shop.procurement.infra.SupplyDraftRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The draft walks READ → MATCH → CARDS → READY on its own; a refusal of a later step is a warning, not a stop. */
class SupplyDraftPipelineTest {

    static final long ADMIN = 42L;
    static final CatalogItem MAT = new CatalogItem("11111111-aaaa-4000-8000-000000000001", "Коврик ZP1 чёрный", "Zpmax",
            "c1", List.of(), null);
    static final SourceLine L1 = new SourceLine("L1", "ZP1 黑色", null, null, "Zpmax", "ZP1", "black", 2, 100.0, null, null);
    static final SourceLine L2 = new SourceLine("L2", "ZP9 新款", null, null, "Zpmax", "ZP9", null, 3, 10.0, null, null);

    SupplyDraftRepository repo = mock(SupplyDraftRepository.class);
    SupplyDraftAi ai = mock(SupplyDraftAi.class);
    SupplyDraftMatching matching = mock(SupplyDraftMatching.class);
    SupplyDraftCatalog catalog = mock(SupplyDraftCatalog.class);
    NewProductCards newCards = mock(NewProductCards.class);
    DomainEvents events = mock(DomainEvents.class);
    SupplyDraftJson json = new SupplyDraftJson();
    Clock clock = Clock.fixed(Instant.parse("2026-11-08T10:00:00Z"), ZoneOffset.UTC);
    SupplyDraftPipeline pipeline;
    SupplyDraft draft;

    @BeforeEach
    void setUp() {
        pipeline = new SupplyDraftPipeline(repo, json, ai, new SupplyDraftReading(ai, matching, clock),
                new SupplyDraftCards(ai, newCards, json), catalog, events, clock);
        DraftState s = new DraftState();
        s.setReadJob(1L);
        draft = SupplyDraft.start(ADMIN, List.of(7L), json.write(s), clock.instant());
        ReflectionTestUtils.setField(draft, "id", 5L);
        when(repo.lockById(5L)).thenReturn(Optional.of(draft));
        when(catalog.items()).thenReturn(List.of(MAT));
        when(catalog.leaves()).thenReturn(List.of(new LeafCategory("c1", "kovriki", "Коврики")));
        when(ai.result(1L, ADMIN)).thenReturn(Optional.of(new SupplyDraftAi.Result(true,
                "{\"supplier\":\"Zpmax\",\"currency\":\"CNY\",\"lines\":[{\"text\":\"ZP1 黑色\",\"qty\":2,\"unitPrice\":100},"
                        + "{\"text\":\"ZP9 新款\",\"qty\":3,\"unitPrice\":10}]}", null)));
        doAnswer(inv -> {
            DraftState st = inv.getArgument(0);
            st.setTitle("Zpmax");
            st.setCurrency("CNY");
            st.setFxRate(new BigDecimal("6"));
            st.setRows(List.of(new ReviewRow(L1, LineDecision.match(MAT.id(), null, "auto"), List.of()),
                    new ReviewRow(L2, LineDecision.open(), List.of())));
            return null;
        }).when(matching).seed(any(), any());
    }

    @Test
    void walksAllStepsAndAnnouncesTheReadyDraft() {
        when(ai.match(eq(5L), eq(ADMIN), eq(1), anyString(), anyString())).thenReturn(2L);
        when(ai.result(2L, ADMIN)).thenReturn(Optional.empty()).thenReturn(Optional.of(new SupplyDraftAi.Result(true,
                "{\"L2\":{\"new\":{\"title\":\"Коврик ZP9\",\"brand\":\"Zpmax\",\"category\":\"kovriki\",\"variant\":null}}}", null)));
        when(newCards.prompt(any())).thenReturn("card prompt");
        when(ai.card(5L, ADMIN, "L2", "card prompt")).thenReturn(3L);
        when(ai.result(3L, ADMIN)).thenReturn(Optional.of(new SupplyDraftAi.Result(true, "card answer", null)));
        when(newCards.parse("card answer", SupplyDraftCards.promptKey(5L, "L2"))).thenReturn(Optional.of(card("Коврик Zpmax ZP9 Speed")));

        pipeline.advance(5L);                       // READ done → MATCH
        assertThat(draft.getStep()).isEqualTo(SupplyDraft.Step.MATCH);
        pipeline.advance(5L);                       // the match task starts
        pipeline.advance(5L);                       // still running
        assertThat(draft.getStep()).isEqualTo(SupplyDraft.Step.MATCH);
        pipeline.advance(5L);                       // answer → CARDS, price proposed
        DraftState s = json.read(draft.getState());
        assertThat(draft.getStep()).isEqualTo(SupplyDraft.Step.CARDS);
        assertThat(s.getPrices()).containsEntry("L2", 120L);        // 10 ¥ × 6 × 2
        pipeline.advance(5L);                       // card task starts
        pipeline.advance(5L);                       // card answer → READY

        s = json.read(draft.getState());
        assertThat(draft.getStatus()).isEqualTo(SupplyDraft.Status.READY);
        assertThat(s.getCards()).containsKey("L2");
        assertThat(s.getRows().get(1).decision().draft().title()).isEqualTo("Коврик Zpmax ZP9 Speed");
        assertThat(s.getRows().get(1).decision().draft().categoryId()).isEqualTo("c1");
        verify(events).publish(new SupplyDraftEvents.Ready(5L, ADMIN, "Zpmax", 2, 1));
    }

    @Test
    void aRefusedMatchIsAWarningAndTheDraftStillGetsReady() {
        when(ai.match(anyLong(), anyLong(), anyInt(), anyString(), anyString()))
                .thenThrow(new DomainException.Conflict(AiError.DAY_LIMIT));

        pipeline.advance(5L);
        pipeline.advance(5L);
        pipeline.advance(5L);

        DraftState s = json.read(draft.getState());
        assertThat(draft.getStatus()).isEqualTo(SupplyDraft.Status.READY);
        assertThat(s.getWarnings()).singleElement().asString().startsWith("Сопоставление ИИ не запустилось");
        assertThat(s.getRows().get(1).decision().kind()).isEqualTo("open");
        verify(ai, never()).card(anyLong(), anyLong(), anyString(), anyString());
    }

    @Test
    void anUnreadableInvoiceFailsTheDraft() {
        when(ai.result(1L, ADMIN)).thenReturn(Optional.of(new SupplyDraftAi.Result(false, null, "ИИ вернул пустой ответ")));

        pipeline.advance(5L);

        assertThat(draft.getStatus()).isEqualTo(SupplyDraft.Status.FAILED);
        assertThat(draft.getFailure()).contains("ИИ вернул пустой ответ");
        verify(matching, never()).seed(any(), any());
    }

    private static CardDraft card(String title) {
        return new CardDraft("kovriki", "c1", "Zpmax", Map.of(), Map.of(), 80, Map.of("ru", title), Map.of("ru", "Описание"),
                Map.of(), List.of(), List.of("https://example.com/zp9.jpg"), Map.of(), null);
    }
}
