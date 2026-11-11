package com.maxsolch.shop.delivery.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.maxsolch.shop.delivery.domain.NovaPoshtaException;
import com.maxsolch.shop.delivery.domain.NovaPoshtaGateway;
import com.maxsolch.shop.delivery.domain.Parcel;
import com.maxsolch.shop.delivery.infra.NovaPoshtaCityRepository;
import com.maxsolch.shop.order.domain.NpServiceType;
import com.maxsolch.shop.settings.app.SettingsService;
import org.junit.jupiter.api.Test;
import org.springframework.cache.CacheManager;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The checkout hints when Nova Poshta is down or says no: give up quietly, pause only for an unreachable NP. */
class NovaPoshtaDownTest {

    private static final ObjectMapper M = new ObjectMapper();
    private static final Parcel PARCEL = new Parcel(1000, 200, 150, 100, "test");

    private static NovaPoshtaGateway gateway() {
        NovaPoshtaGateway api = mock(NovaPoshtaGateway.class);
        when(api.keyConfigured()).thenReturn(true);
        when(api.props()).thenAnswer(i -> M.createObjectNode());
        return api;
    }

    private static NovaPoshtaSenderService sender() {
        NovaPoshtaSenderService sender = mock(NovaPoshtaSenderService.class);
        NovaPoshtaSenderService.SenderConfig cfg = new NovaPoshtaSenderService.SenderConfig("cp", "Shop",
                "PrivatePerson", "contact", "Contact", "380000000000", List.of(),
                List.of(new NovaPoshtaSenderService.SenderWarehouse("wh", "65", "Відділення №65", "city-from",
                        "Харків")), "wh", Instant.now());
        when(sender.get()).thenReturn(Optional.of(cfg));
        return sender;
    }

    private static CacheManager caches() {
        return new ConcurrentMapCacheManager(DeliveryCaches.NP_PRICE, DeliveryCaches.NP_DOWN,
                DeliveryCaches.NP_STREETS);
    }

    private static NovaPoshtaPriceService prices(NovaPoshtaGateway api) {
        return new NovaPoshtaPriceService(api, sender(), mock(SettingsService.class), caches());
    }

    @Test
    void anErrorAboutOneCityDoesNotPauseTheHintForEveryone() {
        NovaPoshtaGateway api = gateway();
        when(api.callQuick(eq("InternetDocument"), eq("getDocumentPrice"), any()))
                .thenThrow(NovaPoshtaException.rejected("CityRecipient is invalid"));
        NovaPoshtaPriceService prices = prices(api);
        assertThat(prices.estimate("junk", NpServiceType.WAREHOUSE, PARCEL, 1500_00, 0)).isEmpty();
        assertThat(prices.estimate("city-to", NpServiceType.WAREHOUSE, PARCEL, 1500_00, 0)).isEmpty();
        verify(api, times(2)).callQuick(anyString(), anyString(), any());
    }

    @Test
    void priceHintPausesAfterNovaPoshtaDidNotAnswer() {
        NovaPoshtaGateway api = gateway();
        when(api.callQuick(anyString(), anyString(), any()))
                .thenThrow(NovaPoshtaException.unavailable("timeout"));
        NovaPoshtaPriceService prices = prices(api);
        assertThat(prices.estimate("city-to", NpServiceType.WAREHOUSE, PARCEL, 1500_00, 0)).isEmpty();
        assertThat(prices.estimate("city-other", NpServiceType.WAREHOUSE, PARCEL, 1500_00, 0)).isEmpty();
        verify(api, times(1)).callQuick(anyString(), anyString(), any());
    }

    @Test
    void streetSearchFallsBackToAnEmptyList() {
        NovaPoshtaGateway api = gateway();
        when(api.callQuick(anyString(), anyString(), any())).thenThrow(NovaPoshtaException.unavailable("timeout"));
        NovaPoshtaCityRepository cities = mock(NovaPoshtaCityRepository.class);
        when(cities.existsById("city-ref")).thenReturn(true);
        NpCheckout c = new NpCheckout(api, null, null, mock(SettingsService.class), cities, caches());
        assertThat(c.streets("city-ref", "Сумська")).isEmpty();
    }

    @Test
    void streetSearchOnlyAsksAboutKnownCities() {
        NovaPoshtaGateway api = gateway();
        NovaPoshtaCityRepository cities = mock(NovaPoshtaCityRepository.class);
        NpCheckout c = new NpCheckout(api, null, null, mock(SettingsService.class), cities, caches());
        assertThat(c.streets("anything-a-stranger-sends", "Сумська")).isEmpty();
        verify(api, never()).callQuick(anyString(), anyString(), any());
    }

    @Test
    void aHandTypedStreetIsFoundByItsName() throws Exception {
        NovaPoshtaGateway api = gateway();
        JsonNode two = M.readTree("[{\"Ref\":\"r1\",\"Description\":\"Сумська\"},"
                + "{\"Ref\":\"r2\",\"Description\":\"Сумський Шлях\"}]");
        when(api.call(eq("Address"), eq("getStreet"), any(ObjectNode.class))).thenReturn(two);
        NpWaybillWriter w = new NpWaybillWriter(api, mock(SettingsService.class), null, Clock.systemUTC());
        assertThat(w.findStreet("city", "вул. Сумська")).isEqualTo("r1");
        assertThat(w.findStreet("city", "сумська")).isEqualTo("r1");
        assertThatThrownBy(() -> w.findStreet("city", "Сум")).hasMessageContaining("Изменить доставку");
    }
}
