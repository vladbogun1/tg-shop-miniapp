package com.maxsolch.shop.delivery.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.delivery.api.NpWebhookController;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.infra.DeliveryProperties;
import com.maxsolch.shop.delivery.infra.NpWebhookEventStore;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import jakarta.servlet.ServletInputStream;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import java.io.ByteArrayInputStream;
import java.time.Clock;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@code POST /api/np/webhook} end to end without Spring: the secret before the body, the 64 KB cap, a retry of a
 * handled message (parsing and the claim table itself: {@link NpWebhookServiceTest}).
 */
class NpWebhookEndpointTest {

    private static final String SECRET = "test-webhook-secret";
    private static final String BODY = """
            {"number":"20450000000000","history_tracking":[
              {"code":"7","code_name":"Прибув у відділення","date":"2026-10-09T08:10:00.000000Z"}]}
            """;

    private final OrderShipmentRepository shipments = mock(OrderShipmentRepository.class);
    private final ShipmentStatusApplier applier = mock(ShipmentStatusApplier.class);
    private final NpWebhookServiceTest.ClaimTable claims = new NpWebhookServiceTest.ClaimTable();
    private final NpWebhookController controller = controller(SECRET);

    private NpWebhookController controller(String secret) {
        DeliveryProperties props = new DeliveryProperties();
        props.getNovaposhta().setWebhookSecret(secret);
        NpWebhookService svc = new NpWebhookService(props, shipments, applier, new NpWebhookEventStore(claims),
                Clock.systemUTC());
        return new NpWebhookController(svc, new ObjectMapper());
    }

    /** A request whose body must not be read: reading it fails the test. */
    private static MockHttpServletRequest untouchable() {
        return new MockHttpServletRequest("POST", "/api/np/webhook") {
            @Override
            public ServletInputStream getInputStream() {
                throw new AssertionError("the body was read before the secret was checked");
            }
        };
    }

    private static MockHttpServletRequest request(byte[] body) {
        MockHttpServletRequest r = new MockHttpServletRequest("POST", "/api/np/webhook");
        r.setContent(body);
        return r;
    }

    private static String status(ResponseEntity<Map<String, String>> r) {
        return r.getBody() == null ? null : r.getBody().get("status");
    }

    @Test
    void wrongOrMissingSecretIs401BeforeTheBodyIsRead() {
        assertThat(controller.webhook("wrong", "id.1", untouchable()).getStatusCode().value()).isEqualTo(401);
        assertThat(controller.webhook(null, "id.1", untouchable()).getStatusCode().value()).isEqualTo(401);
        assertThat(controller.webhook("", "id.1", untouchable()).getStatusCode().value()).isEqualTo(401);
        verify(applier, never()).apply(any(), any(), eq(false));
    }

    @Test
    void noSecretConfiguredMeansTheEndpointIsOff() {
        assertThat(controller(" ").webhook(SECRET, "id.1", untouchable()).getStatusCode().value()).isEqualTo(404);
    }

    @Test
    void aBodyOver64KbIs413() {
        // A declared length above the cap: refused without reading.
        MockHttpServletRequest declared = new MockHttpServletRequest("POST", "/api/np/webhook") {
            @Override
            public long getContentLengthLong() {
                return 64 * 1024 + 1;
            }

            @Override
            public ServletInputStream getInputStream() {
                throw new AssertionError("an oversized body was read");
            }
        };
        assertThat(controller.webhook(SECRET, "id.1", declared).getStatusCode().value()).isEqualTo(413);
        MockHttpServletRequest big = request(new byte[64 * 1024 + 1]);
        assertThat(controller.webhook(SECRET, "id.1", big).getStatusCode().value()).isEqualTo(413);

        MockHttpServletRequest chunked = new MockHttpServletRequest("POST", "/api/np/webhook") {
            @Override
            public long getContentLengthLong() {
                return -1;
            }

            @Override
            public ServletInputStream getInputStream() {
                ByteArrayInputStream in = new ByteArrayInputStream(new byte[64 * 1024 + 10]);
                return new org.springframework.mock.web.DelegatingServletInputStream(in);
            }
        };
        ResponseEntity<Map<String, String>> r = controller.webhook(SECRET, "id.1", chunked);
        assertThat(r.getStatusCode().value()).isEqualTo(413);
        assertThat(status(r)).isEqualTo("too_large");
        verify(applier, never()).apply(any(), any(), eq(false));
    }

    @Test
    void aRetryOfAHandledMessageIsAcknowledgedButNotAppliedAgain() {
        OrderShipment s = NpFixtures.api(com.maxsolch.shop.delivery.domain.ShipmentStage.IN_TRANSIT);
        when(shipments.findByTtnAndActiveTrue("20450000000000")).thenReturn(List.of(s));

        ResponseEntity<Map<String, String>> first = controller.webhook(SECRET, "msg-1.1", request(BODY.getBytes()));
        ResponseEntity<Map<String, String>> retry = controller.webhook(SECRET, "msg-1.2", request(BODY.getBytes()));

        assertThat(first.getStatusCode().value()).isEqualTo(200);
        assertThat(status(first)).isEqualTo("applied");
        assertThat(retry.getStatusCode().value()).isEqualTo(200);
        assertThat(status(retry)).isEqualTo("duplicate");
        verify(applier, times(1)).apply(eq(s.getId()), any(), eq(false));
    }

    @Test
    void aFailedApplyIs5xxAndTheRetryGetsAnotherChance() {
        OrderShipment s = NpFixtures.api(com.maxsolch.shop.delivery.domain.ShipmentStage.IN_TRANSIT);
        when(shipments.findByTtnAndActiveTrue("20450000000000")).thenReturn(List.of(s));
        org.mockito.Mockito.doThrow(new IllegalStateException("db")).doNothing()
                .when(applier).apply(any(), any(), eq(false));

        assertThat(controller.webhook(SECRET, "msg-2.1", request(BODY.getBytes())).getStatusCode().value())
                .isEqualTo(500);
        assertThat(status(controller.webhook(SECRET, "msg-2.2", request(BODY.getBytes())))).isEqualTo("applied");
    }
}
