package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.NovaPoshtaWarehouse;
import com.maxsolch.shop.delivery.infra.NovaPoshtaWarehouseRepository;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.order.domain.NpServiceType;
import com.maxsolch.shop.settings.app.SettingsService;
import org.springframework.stereotype.Component;

/** The cell of the parcel locker a waybill goes to ({@link PostomatLimits}), for packing a soft bag into it. */
@Component
class PostomatCells {

    private final NovaPoshtaWarehouseRepository warehouses;
    private final SettingsService settings;

    PostomatCells(NovaPoshtaWarehouseRepository warehouses, SettingsService settings) {
        this.warehouses = warehouses;
        this.settings = settings;
    }

    /** The cell's sides in mm, smallest first; null when the parcel does not go to a parcel locker. */
    int[] cell(String serviceType, ShippingOrder order) {
        if (!NpServiceType.POSTOMAT.name().equals(serviceType)) {
            return null;
        }
        String ref = order.warehouseRef();
        NovaPoshtaWarehouse w = ref == null || ref.isBlank() ? null : warehouses.findById(ref).orElse(null);
        return PostomatLimits.box(w, settings);
    }
}
