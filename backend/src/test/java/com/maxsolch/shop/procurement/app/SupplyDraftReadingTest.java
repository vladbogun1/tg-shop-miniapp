package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.procurement.domain.SupplyDraft;
import com.maxsolch.shop.procurement.domain.supplyai.DraftState;
import com.maxsolch.shop.procurement.domain.supplyai.ExtractedDoc;
import com.maxsolch.shop.procurement.domain.supplyai.LineDecision;
import com.maxsolch.shop.procurement.domain.supplyai.ReviewRow;
import com.maxsolch.shop.procurement.domain.supplyai.SourceLine;
import com.maxsolch.shop.procurement.domain.supplyai.SupplyExtract;
import com.maxsolch.shop.procurement.domain.supplyai.SupplyVerify;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** A reading that does not add up to its total is reread on its own (at most twice); the closest reading goes on. */
class SupplyDraftReadingTest {

    static final long ADMIN = 42L;
    static final String SHORT = answer(400, "{\"text\":\"Aqua\",\"qty\":1,\"unitPrice\":100,\"shot\":1}");
    static final String FULL = answer(400, "{\"text\":\"Aqua\",\"qty\":1,\"unitPrice\":100,\"shot\":1}",
            "{\"text\":\"Origin Pro\",\"variant\":\"Xsoft\",\"qty\":1,\"unitPrice\":300,\"shot\":1}");

    SupplyDraftAi ai = mock(SupplyDraftAi.class);
    SupplyDraftMatching matching = mock(SupplyDraftMatching.class);
    Clock clock = Clock.fixed(Instant.parse("2026-11-09T10:00:00Z"), ZoneOffset.UTC);
    SupplyDraftReading reading = new SupplyDraftReading(ai, matching, clock);
    SupplyDraft draft;
    DraftState s;

    static String answer(double total, String... lines) {
        return "{\"supplier\":\"Xraypad\",\"currency\":\"CNY\",\"total\":" + total + ",\"lines\":[" + String.join(",", lines) + "]}";
    }

    @BeforeEach
    void setUp() {
        draft = SupplyDraft.start(ADMIN, List.of(7L, 8L), "{}", clock.instant());
        ReflectionTestUtils.setField(draft, "id", 5L);
        s = new DraftState();
        s.setReadJob(1L);
        s.setVerifyBudget(SupplyVerify.AUTO_ATTEMPTS);
    }

    @Test
    void aShortReadingIsRereadAndTheFullOneGoesOn() {
        when(ai.result(1L, ADMIN)).thenReturn(Optional.of(new SupplyDraftAi.Result(true, SHORT, null)));
        when(ai.verify(eq(5L), eq(ADMIN), eq(List.of(7L, 8L)), eq(1), anyString())).thenReturn(2L);
        when(ai.result(2L, ADMIN)).thenReturn(Optional.of(new SupplyDraftAi.Result(true, FULL, null)));

        assertThat(reading.advance(draft, s)).isFalse();       // short → reread started
        assertThat(s.getVerifyJobs()).containsExactly(2L);
        assertThat(reading.advance(draft, s)).isTrue();        // the reread adds up

        ArgumentCaptor<SupplyExtract.Parsed> seeded = ArgumentCaptor.forClass(SupplyExtract.Parsed.class);
        verify(matching).seed(eq(s), seeded.capture());
        assertThat(seeded.getValue().doc().lines()).hasSize(2);
        assertThat(s.getDocNotes().get(0)).isEqualTo("ИИ перечитал накладную 1 раз(а): сумма сходится с итогом");
        assertThat(s.getCandidate()).isNull();
    }

    @Test
    void theBudgetEndsTheRereadsAndTheClosestReadingStays() {
        when(ai.result(anyLong(), eq(ADMIN))).thenReturn(Optional.of(new SupplyDraftAi.Result(true, SHORT, null)));
        when(ai.verify(anyLong(), anyLong(), any(), anyInt(), anyString())).thenReturn(2L, 3L);

        assertThat(reading.advance(draft, s)).isFalse();
        assertThat(reading.advance(draft, s)).isFalse();
        assertThat(reading.advance(draft, s)).isTrue();

        assertThat(s.getVerifyJobs()).containsExactly(2L, 3L);
        verify(matching).seed(eq(s), any());
        assertThat(s.getDocNotes().get(0)).endsWith("сумма всё ещё не сходится");
    }

    @Test
    void aFailedRereadKeepsTheFirstReading() {
        when(ai.result(1L, ADMIN)).thenReturn(Optional.of(new SupplyDraftAi.Result(true, SHORT, null)));
        when(ai.verify(anyLong(), anyLong(), any(), anyInt(), anyString())).thenReturn(2L);
        when(ai.result(2L, ADMIN)).thenReturn(Optional.of(new SupplyDraftAi.Result(false, null, "таймаут")));

        reading.advance(draft, s);
        assertThat(reading.advance(draft, s)).isTrue();

        assertThat(draft.getStatus()).isEqualTo(SupplyDraft.Status.RUNNING);
        assertThat(s.getWarnings()).singleElement().asString().contains("таймаут");
        verify(matching).seed(eq(s), any());
    }

    @Test
    void anAgreeingReadingIsNotReread() {
        when(ai.result(1L, ADMIN)).thenReturn(Optional.of(new SupplyDraftAi.Result(true, FULL, null)));

        assertThat(reading.advance(draft, s)).isTrue();

        verify(ai, never()).verify(anyLong(), anyLong(), any(), anyInt(), anyString());
        assertThat(s.getDocNotes()).noneMatch(n -> n.startsWith("ИИ перечитал"));
    }

    @Test
    void theAdminsRereadAddsOnlyTheMissingLines() {
        SourceLine aqua = new SourceLine("L1", "Aqua", null, null, null, null, null, 1, 100.0, null, null);
        s.setDoc(new ExtractedDoc("Xraypad", "CNY", null, null, 400.0, List.of(aqua), null));
        s.setRows(List.of(new ReviewRow(aqua, LineDecision.match("p1", null, "admin"), List.of())));
        s.setRereadMerge(true);
        s.setVerifyJobs(new ArrayList<>(List.of(2L)));
        s.setCandidate(SupplyDraftReading.current(s));
        when(ai.result(2L, ADMIN)).thenReturn(Optional.of(new SupplyDraftAi.Result(true, FULL, null)));
        when(matching.look(eq(s), any())).thenAnswer(inv -> {
            List<SourceLine> lines = inv.getArgument(1);
            return lines.stream().map(l -> new ReviewRow(l, LineDecision.open(), List.of())).toList();
        });

        assertThat(reading.advance(draft, s)).isTrue();

        assertThat(s.getRows()).extracting(r -> r.line().id()).containsExactly("L1", "R1");
        assertThat(s.getRows().get(0).decision().kind()).isEqualTo("match");
        assertThat(s.getRows().get(1).line().text()).isEqualTo("Origin Pro");
        assertThat(s.isRereadMerge()).isFalse();
        verify(matching, never()).seed(any(), any());
    }
}
