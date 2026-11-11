package com.maxsolch.shop.delivery.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.infra.DeliveryProperties;
import com.maxsolch.shop.delivery.infra.NpWebhookEventStore;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Tracking pushes: parsing, the secret, once-only handling of NP's retries. */
class NpWebhookServiceTest {

    private static final ObjectMapper M = new ObjectMapper();

    private static JsonNode body(String json) throws Exception {
        return M.readTree(json);
    }

    private static final String SAMPLE = """
            {"number":"20450000000000","scheduled_delivery_date":"2026-10-10T00:00:00.000000Z",
             "history_tracking":[
               {"code":"7","code_name":"Прибув у відділення","date":"2026-10-09T08:10:00.000000Z"},
               {"code":"4","code_name":"Відправлено","date":"2026-10-08T09:32:05.000000Z"}]}
            """;

    @Test
    void latestEntryByDateWins() throws Exception {
        NpWebhookService.Event e = NpWebhookService.parse(body(SAMPLE)).orElseThrow();
        assertThat(e.ttn()).isEqualTo("20450000000000");
        assertThat(e.update().code()).isEqualTo("7");
        assertThat(e.update().text()).isEqualTo("Прибув у відділення");
        assertThat(e.update().scheduledDelivery()).isEqualTo(LocalDate.of(2026, 10, 10));
        assertThat(e.update().at()).isEqualTo(Instant.parse("2026-10-09T08:10:00Z"));
    }

    @Test
    void emptyOrBrokenBodiesAreIgnored() throws Exception {
        assertThat(NpWebhookService.parse(null)).isEmpty();
        assertThat(NpWebhookService.parse(body("{\"number\":\"1\",\"history_tracking\":[]}"))).isEmpty();
        assertThat(NpWebhookService.parse(body("{\"history_tracking\":[{\"code\":\"4\"}]}"))).isEmpty();
        // Undated history: the first entry is kept.
        assertThat(NpWebhookService.parse(body("{\"number\":\"1\",\"history_tracking\":[{\"code\":\"4\"},{\"code\":\"5\"}]}"))
                .orElseThrow().update().code()).isEqualTo("4");
    }

    @Test
    void attemptHeaderGivesTheMessageId() {
        assertThat(NpWebhookService.eventId("8f14e45f-ceea-467e-9a3a-0e1a1b1e2b1c.2"))
                .isEqualTo("8f14e45f-ceea-467e-9a3a-0e1a1b1e2b1c");
        assertThat(NpWebhookService.eventId("abc")).isEqualTo("abc");
        assertThat(NpWebhookService.eventId(" ")).isNull();
        assertThat(NpWebhookService.eventId(null)).isNull();
    }

    @Test
    void secretIsComparedExactly() {
        assertThat(NpWebhookService.secretMatches("s3cretValue", "s3cretValue")).isTrue();
        assertThat(NpWebhookService.secretMatches("s3cretValue", "s3cretvalue")).isFalse();
        assertThat(NpWebhookService.secretMatches("s3cretValue", null)).isFalse();
        assertThat(NpWebhookService.secretMatches("", "")).isFalse();
        assertThat(NpWebhookService.secretMatches(null, "x")).isFalse();
    }

    @Test
    void retryOfAHandledMessageIsNotAppliedTwice() throws Exception {
        OrderShipmentRepository repo = mock(OrderShipmentRepository.class);
        ShipmentStatusApplier tracking = mock(ShipmentStatusApplier.class);
        ClaimTable jdbc = new ClaimTable();
        OrderShipment s = new OrderShipment();
        s.setId(new byte[16]);
        when(repo.findByTtnAndActiveTrue("20450000000000")).thenReturn(List.of(s));
        NpWebhookService svc = new NpWebhookService(new DeliveryProperties(), repo, tracking, new NpWebhookEventStore(jdbc), Clock.systemUTC());

        assertThat(svc.handle("id-1.1", body(SAMPLE))).isEqualTo(NpWebhookService.Outcome.APPLIED);
        assertThat(svc.handle("id-1.2", body(SAMPLE))).isEqualTo(NpWebhookService.Outcome.DUPLICATE);
        verify(tracking, times(1)).apply(eq(s.getId()), any(), eq(false));
        assertThat(jdbc.ids).containsExactly("id-1");
    }

    /** np_webhook_events with its primary key. */
    static class ClaimTable extends JdbcTemplate {
        final java.util.Set<String> ids = new java.util.LinkedHashSet<>();

        @Override
        public int update(String sql, Object... args) {
            if (sql.startsWith("INSERT") && !ids.add((String) args[0])) {
                throw new DuplicateKeyException("dup");
            }
            if (sql.startsWith("DELETE")) {
                ids.remove((String) args[0]);
            }
            return 1;
        }
    }

    @Test
    void foreignWaybillIsAcknowledgedWithoutClaim() throws Exception {
        OrderShipmentRepository repo = mock(OrderShipmentRepository.class);
        ShipmentStatusApplier tracking = mock(ShipmentStatusApplier.class);
        ClaimTable jdbc = new ClaimTable();
        when(repo.findByTtnAndActiveTrue(anyString())).thenReturn(List.of());
        NpWebhookService svc = new NpWebhookService(new DeliveryProperties(), repo, tracking, new NpWebhookEventStore(jdbc), Clock.systemUTC());

        assertThat(svc.handle("id-2.1", body(SAMPLE))).isEqualTo(NpWebhookService.Outcome.UNKNOWN_TTN);
        assertThat(jdbc.ids).isEmpty();
        verify(tracking, never()).apply(any(), any(), eq(false));
    }
}
