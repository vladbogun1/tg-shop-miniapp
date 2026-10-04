package com.maxsolch.shop.analytics;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.common.UuidUtil;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class ClientEventServiceTest {

    @Mock
    ClientEventRepository repository;

    private ClientEventService service() {
        return new ClientEventService(repository, new ObjectMapper());
    }

    private static ClientEventDto ev(String event, String meta) {
        return new ClientEventDto(event, null, "/", meta, Instant.parse("2026-10-01T10:00:00Z"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void structuredEvent_liftsTheProductIdOutOfMeta() {
        String id = "6ae0add8-2858-4b15-a69a-30add6ff3d9d";
        int saved = service().record(5L, new ClientEventBatch("s1", List.of(
                ev(StructuredEvents.PRODUCT_VIEW, "{\"productId\":\"" + id + "\"}"),
                ev("click", "not json"))));

        ArgumentCaptor<List<ClientEvent>> captor = ArgumentCaptor.forClass(List.class);
        verify(repository).saveAll(captor.capture());
        assertThat(saved).isEqualTo(2);
        ClientEvent view = captor.getValue().get(0);
        assertThat(view.getChannel()).isEqualTo(EventChannel.MINIAPP);
        assertThat(UuidUtil.toString(view.getProductId())).isEqualTo(id);
        assertThat(captor.getValue().get(1).getProductId()).isNull();
    }

    @Test
    @SuppressWarnings("unchecked")
    void web_acceptsOnlyWhitelistedEvents_anonymousAllowed() {
        int saved = service().recordWeb(null, new WebEventBatch("anon-1234567", "tab1", List.of(
                ev(StructuredEvents.ADD_TO_CART, "{\"productId\":\"bad\"}"),
                ev("click", "{\"hit\":\"div.fixed\"}"),
                ev("debug_dump", null))));

        ArgumentCaptor<List<ClientEvent>> captor = ArgumentCaptor.forClass(List.class);
        verify(repository).saveAll(captor.capture());
        assertThat(saved).isEqualTo(2); // clicks are journalled from the web too; unknown events are not
        assertThat(captor.getValue().get(1).getEvent()).isEqualTo("click");
        ClientEvent row = captor.getValue().get(0);
        assertThat(row.getChannel()).isEqualTo(EventChannel.WEB);
        assertThat(row.getTelegramUserId()).isNull();
        assertThat(row.getAnonId()).isEqualTo("anon-1234567");
        assertThat(row.getProductId()).isNull(); // malformed id is ignored, not an error
    }

    @Test
    void web_withoutAValidAnonId_isDropped() {
        assertThat(service().recordWeb(null, new WebEventBatch("<script>", "t", List.of(ev("view", null))))).isZero();
        verify(repository, never()).saveAll(org.mockito.ArgumentMatchers.anyList());
    }
}
