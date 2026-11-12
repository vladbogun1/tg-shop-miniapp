package com.maxsolch.shop.staff.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.staff.domain.AdminClientEvent;
import com.maxsolch.shop.staff.infra.AdminClientEventStore;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataAccessResourceFailureException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Admin panel telemetry: who, how many, which kinds, how big — and that a failure never reaches the panel. */
class AdminTelemetryTest {

    private static final long ADMIN = 4242L;
    private static final ObjectMapper JSON = new ObjectMapper();

    private final AdminClientEventStore store = mock(AdminClientEventStore.class);
    private final CurrentActor actor = mock(CurrentActor.class);
    private final MutableClock clock = new MutableClock(Instant.parse("2026-11-12T10:00:00Z"));
    private final AdminTelemetry telemetry = new AdminTelemetry(store, actor, clock);

    AdminTelemetryTest() {
        when(actor.userId()).thenReturn(ADMIN);
    }

    private static TelemetryBatch.Event event(String kind) {
        return new TelemetryBatch.Event(kind, "/orders", "b1", "iPhone", true, null);
    }

    @SuppressWarnings("unchecked")
    private List<AdminClientEvent> stored() {
        ArgumentCaptor<List<AdminClientEvent>> rows = ArgumentCaptor.forClass(List.class);
        verify(store).insertAll(rows.capture());
        return rows.getValue();
    }

    @Test
    void adminIdComesFromTheActor_andTimeFromTheClock() {
        telemetry.record(new TelemetryBatch(List.of(event("freeze"))));

        AdminClientEvent row = stored().get(0);
        assertThat(row.adminId()).isEqualTo(ADMIN);
        assertThat(row.createdAt()).isEqualTo(clock.instant());
        assertThat(row.standalone()).isTrue();
        verify(store).countSince(ADMIN, Instant.parse("2026-11-12T09:50:00Z"));
    }

    @Test
    void batchIsCappedAt50_andUnknownKindsAreDropped() {
        List<TelemetryBatch.Event> events = new ArrayList<>();
        events.add(event("nav"));
        events.add(event("bogus"));
        events.add(null);
        for (int i = 0; i < 70; i++) {
            events.add(event(i % 2 == 0 ? "error" : "blocked_tap"));
        }

        int n = telemetry.record(new TelemetryBatch(events));

        // the first 50 entries are looked at: 3 dropped, 47 kept
        assertThat(n).isEqualTo(47);
        assertThat(stored()).hasSize(47).allSatisfy(r -> assertThat(AdminClientEvent.KINDS).contains(r.kind()));
    }

    @Test
    void rateLimitKeepsOnlyWhatIsLeftOfTheWindow() {
        when(store.countSince(eq(ADMIN), any())).thenReturn(AdminTelemetry.RATE_LIMIT - 2);

        int n = telemetry.record(new TelemetryBatch(List.of(event("error"), event("error"), event("error"))));

        assertThat(n).isEqualTo(2);
        assertThat(stored()).hasSize(2);
    }

    @Test
    void overTheLimitNothingIsWritten() {
        when(store.countSince(eq(ADMIN), any())).thenReturn(AdminTelemetry.RATE_LIMIT);

        assertThat(telemetry.record(new TelemetryBatch(List.of(event("error"))))).isZero();
        verify(store, never()).insertAll(any());
    }

    @Test
    void emptyOrMissingBatchIsFine() {
        assertThat(telemetry.record(null)).isZero();
        assertThat(telemetry.record(new TelemetryBatch(null))).isZero();
        assertThat(telemetry.record(new TelemetryBatch(List.of()))).isZero();
        verify(store, never()).countSince(anyLong(), any());
    }

    @Test
    void databaseFailureIsSwallowed() {
        doThrow(new DataAccessResourceFailureException("down")).when(store).insertAll(any());

        assertThat(telemetry.record(new TelemetryBatch(List.of(event("error"))))).isZero();
    }

    @Test
    void stringsAreCapped() {
        String longText = "x".repeat(1000);
        telemetry.record(new TelemetryBatch(List.of(new TelemetryBatch.Event("error", longText, longText, longText, null, null))));

        AdminClientEvent row = stored().get(0);
        assertThat(row.path()).hasSize(AdminClientEvent.PATH_MAX);
        assertThat(row.build()).hasSize(AdminClientEvent.BUILD_MAX);
        assertThat(row.ua()).hasSize(AdminClientEvent.UA_MAX);
        assertThat(row.standalone()).isFalse();
    }

    @Test
    void metaStaysValidJson_trailGoesFirst() throws Exception {
        ObjectNode small = JSON.createObjectNode().put("message", "boom");
        assertThat(AdminTelemetry.metaOf(small)).isEqualTo("{\"message\":\"boom\"}");

        ObjectNode withTrail = JSON.createObjectNode().put("message", "boom");
        withTrail.putArray("trail").add("y".repeat(3000));
        JsonNode cut = JSON.readTree(AdminTelemetry.metaOf(withTrail));
        assertThat(cut.get("message").asText()).isEqualTo("boom");
        assertThat(cut.has("trail")).isFalse();
        assertThat(cut.get("trailDropped").asBoolean()).isTrue();

        ObjectNode huge = JSON.createObjectNode().put("message", "z".repeat(5000));
        assertThat(AdminTelemetry.metaOf(huge)).isEqualTo("{\"truncated\":true}");
        assertThat(AdminTelemetry.metaOf(null)).isNull();
    }

    @Test
    void listLimitIsClamped() {
        telemetry.latest(10_000, " freeze ", 5L);
        verify(store).latest(AdminTelemetry.LIST_MAX, "freeze", 5L);
        telemetry.latest(null, "", null);
        verify(store).latest(AdminTelemetry.LIST_DEFAULT, null, null);
    }
}
