package com.maxsolch.shop.novaposhta;

import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.repository.NovaPoshtaCityRepository;
import com.maxsolch.shop.repository.NovaPoshtaWarehouseRepository;

/** Builds the sync service for tests in one place (the wiring changes when the module is moved). */
final class TestSync {

    private TestSync() {
    }

    static NovaPoshtaSyncService create(AppProperties props, NovaPoshtaWarehouseRepository warehouses,
                                        NovaPoshtaCityRepository cities, SettingsService settings) {
        return new NovaPoshtaSyncService(props, warehouses,
                new NovaPoshtaSyncService.NovaPoshtaUpsertService(cities, warehouses), settings);
    }
}
