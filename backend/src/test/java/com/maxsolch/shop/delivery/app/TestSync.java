package com.maxsolch.shop.delivery.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.delivery.infra.NovaPoshtaCityRepository;
import com.maxsolch.shop.delivery.infra.NovaPoshtaHttpClient;
import com.maxsolch.shop.delivery.infra.NovaPoshtaWarehouseRepository;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.HttpClientsProperties;
import com.maxsolch.shop.platform.settings.SettingsService;

import java.time.Clock;

/** Builds the sync service for tests in one place (the wiring changes when the module is moved). */
final class TestSync {

    private TestSync() {
    }

    static NovaPoshtaSyncService create(AppProperties props, NovaPoshtaWarehouseRepository warehouses,
                                        NovaPoshtaCityRepository cities, SettingsService settings) {
        return create(props, warehouses, cities, settings, Clock.systemUTC());
    }

    static NovaPoshtaSyncService create(AppProperties props, NovaPoshtaWarehouseRepository warehouses,
                                        NovaPoshtaCityRepository cities, SettingsService settings, Clock clock) {
        NovaPoshtaHttpClient api = new NovaPoshtaHttpClient(props, new ObjectMapper(),
                new HttpClients(new HttpClientsProperties()));
        return new NovaPoshtaSyncService(api, warehouses, new NovaPoshtaUpsertService(cities, warehouses), settings, clock, new com.maxsolch.shop.platform.jobs.Workers());
    }
}
