package com.maxsolch.shop.staff.api;

import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.platform.security.RequiredSuperAdmin;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.staff.app.AdminTelemetry;
import com.maxsolch.shop.staff.domain.AdminClientEvent;
import com.maxsolch.shop.staff.infra.AdminClientEventStore;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * POST/GET /api/admin/telemetry: who may call it (annotations — the security filter chain itself is covered by the
 * other admin endpoints), the admin id from the token and not from the body, the batch cap and the unknown kinds.
 */
class AdminTelemetryControllerTest {

    private static final long TOKEN_ADMIN = 777L;

    private final AdminClientEventStore store = mock(AdminClientEventStore.class);
    private final CurrentActor actor = mock(CurrentActor.class);
    private final AdminTelemetry telemetry = new AdminTelemetry(store, actor,
            Clock.fixed(Instant.parse("2026-11-12T10:00:00Z"), ZoneOffset.UTC));
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new AdminTelemetryController(telemetry)).build();

    AdminTelemetryControllerTest() {
        when(actor.userId()).thenReturn(TOKEN_ADMIN);
    }

    @Test
    void writingNeedsAnAdmin_readingNeedsTheMainAdmin() throws Exception {
        var submit = AdminTelemetryController.class.getMethod("submit", com.maxsolch.shop.staff.app.TelemetryBatch.class);
        var latest = AdminTelemetryController.class.getMethod("latest", Integer.class, String.class, Long.class);
        assertThat(submit.isAnnotationPresent(RequiredAdmin.class)).isTrue();
        assertThat(latest.isAnnotationPresent(RequiredSuperAdmin.class)).isTrue();
        assertThat(AdminTelemetryController.class.isAnnotationPresent(RequiredAdmin.class)).isFalse();
    }

    @Test
    @SuppressWarnings("unchecked")
    void adminIdFromTheToken_bodyAdminIdIgnored_batchCapped_unknownKindsDropped() throws Exception {
        String events = IntStream.range(0, 60)
                .mapToObj(i -> "{\"kind\":\"" + (i == 0 ? "hack" : "freeze") + "\",\"path\":\"/orders\",\"adminId\":1,"
                        + "\"standalone\":true,\"meta\":{\"stallMs\":" + (2000 + i) + "}}")
                .collect(Collectors.joining(","));

        mvc.perform(post("/api/admin/telemetry").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"adminId\":1,\"events\":[" + events + "]}"))
                .andExpect(status().isNoContent());

        ArgumentCaptor<List<AdminClientEvent>> rows = ArgumentCaptor.forClass(List.class);
        verify(store).insertAll(rows.capture());
        assertThat(rows.getValue()).hasSize(AdminTelemetry.MAX_BATCH - 1)
                .allSatisfy(r -> {
                    assertThat(r.adminId()).isEqualTo(TOKEN_ADMIN);
                    assertThat(r.kind()).isEqualTo("freeze");
                });
        assertThat(rows.getValue().get(0).metaJson()).isEqualTo("{\"stallMs\":2001}");
    }

    @Test
    void emptyBodyIs204_brokenJsonIs400() throws Exception {
        mvc.perform(post("/api/admin/telemetry")).andExpect(status().isNoContent());
        mvc.perform(post("/api/admin/telemetry").contentType(MediaType.APPLICATION_JSON).content("{\"events\":[")).andExpect(status().isBadRequest());
        verifyNoInteractions(store);
    }

    @Test
    void latestReturnsMetaAsJson() throws Exception {
        when(store.latest(100, "freeze", null)).thenReturn(List.of(new AdminClientEvent(5L, TOKEN_ADMIN, "freeze", "/orders",
                "b1", "iPhone", true, "{\"stallMs\":2500}", Instant.parse("2026-11-12T09:00:00Z"))));

        mvc.perform(get("/api/admin/telemetry").param("kind", "freeze"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].adminId").value(TOKEN_ADMIN))
                .andExpect(jsonPath("$[0].meta.stallMs").value(2500));
    }
}
