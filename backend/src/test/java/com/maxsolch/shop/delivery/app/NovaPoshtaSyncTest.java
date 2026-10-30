package com.maxsolch.shop.delivery.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.delivery.domain.NovaPoshtaApi;
import com.maxsolch.shop.delivery.domain.NovaPoshtaCity;
import com.maxsolch.shop.delivery.domain.NovaPoshtaWarehouse;
import com.maxsolch.shop.delivery.infra.DeliveryProperties;
import com.maxsolch.shop.settings.app.SettingsService;
import com.maxsolch.shop.delivery.infra.NovaPoshtaCityRepository;
import com.maxsolch.shop.delivery.infra.NovaPoshtaWarehouseRepository;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The Nova Poshta directory sync: what is asked of the API, what is stored, how a bad answer is reported. */
class NovaPoshtaSyncTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private HttpServer server;
    private final List<String> bodies = new CopyOnWriteArrayList<>();
    private volatile int status = 200;
    private volatile String answer = "{\"data\":[]}";

    private NovaPoshtaWarehouseRepository warehouses;
    private NovaPoshtaCityRepository cities;
    private SettingsService settings;
    private NovaPoshtaSyncService sync;

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            bodies.add(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] out = answer.getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(status, out.length);
            ex.getResponseBody().write(out);
            ex.close();
        });
        server.start();
        warehouses = mock(NovaPoshtaWarehouseRepository.class);
        cities = mock(NovaPoshtaCityRepository.class);
        settings = mock(SettingsService.class);
        when(warehouses.findById(anyString())).thenReturn(Optional.empty());
        when(cities.findById(anyString())).thenReturn(Optional.empty());
        DeliveryProperties props = new DeliveryProperties();
        props.getNovaposhta().setApiUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/");
        props.getNovaposhta().setApiKey("test-key");
        sync = TestSync.create(props, warehouses, cities, settings);
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    @Test
    void asksForWarehousesPageOneAndStoresWarehousesWithTheirCities() throws Exception {
        answer = "{\"data\":[{\"Ref\":\"w1\",\"CityRef\":\"c1\",\"CityDescription\":\"Kyiv\",\"Number\":\"5\","
                + "\"Description\":\"Branch 5\",\"TypeOfWarehouse\":\"t\",\"Latitude\":\"50.4\",\"Longitude\":\"30.5\","
                + "\"SettlementAreaDescription\":\"Kyivska\"},{\"Ref\":\"w2\",\"CityRef\":\"c1\",\"CityDescription\":\"Kyiv\"}]}";

        sync.sync();

        JsonNode asked = JSON.readTree(bodies.get(0));
        assertThat(asked.path("apiKey").asText()).isEqualTo("test-key");
        assertThat(asked.path("modelName").asText()).isEqualTo("AddressGeneral");
        assertThat(asked.path("calledMethod").asText()).isEqualTo("getWarehouses");
        assertThat(asked.path("methodProperties").path("Page").asText()).isEqualTo("1");
        assertThat(asked.path("methodProperties").path("Limit").asText()).isEqualTo("500");
        assertThat(bodies).hasSize(1);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<NovaPoshtaWarehouse>> saved = ArgumentCaptor.forClass(List.class);
        verify(warehouses).saveAll(saved.capture());
        assertThat(saved.getValue()).extracting(NovaPoshtaWarehouse::getRef).containsExactly("w1", "w2");
        assertThat(saved.getValue().get(0).getLat()).isEqualTo(50.4);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Iterable<NovaPoshtaCity>> savedCities = ArgumentCaptor.forClass(Iterable.class);
        verify(cities).saveAll(savedCities.capture());
        List<NovaPoshtaCity> cityList = new ArrayList<>();
        savedCities.getValue().forEach(cityList::add);
        assertThat(cityList).hasSize(1);
        assertThat(cityList.get(0).getName()).isEqualTo("Kyiv");
        assertThat(cityList.get(0).getArea()).isEqualTo("Kyivska");
        verify(settings).putSystem(eq(NovaPoshtaSyncStatus.LAST_SYNC_SUMMARY), eq("отделений: 2, городов: 1"));
    }

    @Test
    void aNon200AnswerIsAnErrorNotASuccess() throws Exception {
        status = 500;
        answer = "oops";

        sync.sync();

        verify(warehouses, never()).saveAll(any());
        verify(settings).putSystem(eq(NovaPoshtaSyncStatus.LAST_ERROR), anyString());
        verify(settings, never()).putSystem(eq(NovaPoshtaSyncStatus.LAST_SYNC_AT), anyString());
    }

    @Test
    void withoutAnApiUrlNothingIsAsked() throws Exception {
        NovaPoshtaSyncService idle = TestSync.create(new DeliveryProperties(), warehouses, cities, settings);

        idle.sync();

        assertThat(bodies).isEmpty();
    }

    @Test
    void swappedCoordinatesAreStoredTheRightWayRound() {
        NovaPoshtaUpsertService upsert = new NovaPoshtaUpsertService(cities, warehouses);
        NovaPoshtaApi.ApiWarehouse swapped = new NovaPoshtaApi.ApiWarehouse("w9", "c9", null, null, null, null,
                "36.37", "49.95", null);

        Map<String, NovaPoshtaCity> seen = new LinkedHashMap<>();
        upsert.upsertPage(List.of(swapped), seen);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<NovaPoshtaWarehouse>> saved = ArgumentCaptor.forClass(List.class);
        verify(warehouses).saveAll(saved.capture());
        assertThat(saved.getValue().get(0).getLat()).isEqualTo(49.95);
        assertThat(saved.getValue().get(0).getLng()).isEqualTo(36.37);
        assertThat(seen).containsKey("c9");
        assertThat(seen.get("c9").getName()).isEqualTo("c9");
    }

    @Test
    void aGatewayHiccupIsRetriedAndTheSyncStillSucceeds() throws Exception {
        java.util.concurrent.atomic.AtomicInteger calls = new java.util.concurrent.atomic.AtomicInteger();
        server.removeContext("/");
        server.createContext("/", ex -> {
            bodies.add(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            boolean first = calls.getAndIncrement() == 0;
            byte[] out = (first ? "busy" : "{\"data\":[{\"Ref\":\"w1\",\"CityRef\":\"c1\"}]}").getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(first ? 503 : 200, out.length);
            ex.getResponseBody().write(out);
            ex.close();
        });

        sync.sync();

        assertThat(bodies).hasSize(2); // the same read asked twice
        verify(settings).putSystem(eq(NovaPoshtaSyncStatus.LAST_SYNC_SUMMARY), eq("отделений: 1, городов: 1"));
    }

    @Test
    void successIsStampedWithTheInjectedClock() throws Exception {
        java.time.Instant at = java.time.Instant.parse("2026-10-30T03:30:00Z");
        NovaPoshtaSyncService fixed = TestSync.create(propsFor(server), warehouses, cities, settings,
                java.time.Clock.fixed(at, java.time.ZoneOffset.UTC));
        answer = "{\"data\":[{\"Ref\":\"w1\",\"CityRef\":\"c1\"}]}";

        fixed.sync();

        verify(settings).putSystem(NovaPoshtaSyncStatus.LAST_SYNC_AT, at.toString());
    }

    @Test
    void theNightlyTriggerHonoursTheSwitchInSettings() throws Exception {
        when(settings.getBool(com.maxsolch.shop.delivery.app.DeliverySettings.NOVAPOSHTA_AUTO_SYNC)).thenReturn(false);

        new NovaPoshtaJobs(sync).nightlySync();
        Thread.sleep(300);

        assertThat(bodies).isEmpty();
    }

    @Test
    void theNightlyTriggerSyncsWhenSwitchedOn() throws Exception {
        when(settings.getBool(com.maxsolch.shop.delivery.app.DeliverySettings.NOVAPOSHTA_AUTO_SYNC)).thenReturn(true);

        new NovaPoshtaJobs(sync).nightlySync();
        long until = System.currentTimeMillis() + 5_000;
        while (bodies.isEmpty() && System.currentTimeMillis() < until) {
            Thread.sleep(50);
        }

        assertThat(bodies).isNotEmpty();
    }

    private static DeliveryProperties propsFor(HttpServer server) {
        DeliveryProperties props = new DeliveryProperties();
        props.getNovaposhta().setApiUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/");
        return props;
    }
}
