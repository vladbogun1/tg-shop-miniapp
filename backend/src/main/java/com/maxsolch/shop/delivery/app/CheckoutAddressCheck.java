package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.NovaPoshtaWarehouse;
import com.maxsolch.shop.delivery.infra.NovaPoshtaWarehouseRepository;
import com.maxsolch.shop.order.app.CreateOrderCommand;
import com.maxsolch.shop.order.app.DeliveryAddressCheck;
import com.maxsolch.shop.order.domain.NpServiceType;
import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.settings.app.SettingsService;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * The Nova Poshta part of a checkout against the local directory: the branch exists in the chosen city and its kind
 * decides WAREHOUSE vs POSTOMAT (the map lets one pick a parcel locker in the branch list), the directory's name is
 * the one the order and the waybill show, parcel lockers and courier delivery can be switched off.
 *
 * <p>The switches {@code novaposhta.courierEnabled} / {@code novaposhta.postomatEnabled} are read with a default of
 * «on», so they work before (and after) {@code DeliverySettings} registers them.
 */
@Component
public class CheckoutAddressCheck implements DeliveryAddressCheck {

    /** Nova Poshta's TypeOfWarehouse ref of a parcel locker (stable; the same one {@link NovaPoshtaService} maps). */
    static final String TYPE_POSTOMAT = "f9316480-5f2d-425d-bc2c-ac7cd29decf0";
    static final String COURIER_ENABLED = "novaposhta.courierEnabled";
    static final String POSTOMAT_ENABLED = "novaposhta.postomatEnabled";

    private final NovaPoshtaWarehouseRepository warehouses;
    private final SettingsService settings;

    public CheckoutAddressCheck(NovaPoshtaWarehouseRepository warehouses, SettingsService settings) {
        this.warehouses = warehouses;
        this.settings = settings;
    }

    @Override
    @Transactional(readOnly = true)
    public Resolved check(Address address) {
        NpServiceType requested = address.serviceType() == null ? NpServiceType.WAREHOUSE : address.serviceType();
        if (requested == NpServiceType.DOORS) {
            if (!settings.get(COURIER_ENABLED, true)) {
                throw new DomainException.BadRequest(OrderError.NP_COURIER_DISABLED);
            }
            return new Resolved(NpServiceType.DOORS, null);
        }
        NovaPoshtaWarehouse wh = warehouses.findById(address.warehouseRef())
                .filter(w -> address.cityRef().equals(w.getCityRef()))
                .orElseThrow(() -> new DomainException.BadRequest(OrderError.NP_WAREHOUSE_UNKNOWN));
        NpServiceType service = TYPE_POSTOMAT.equals(wh.getType()) ? NpServiceType.POSTOMAT : NpServiceType.WAREHOUSE;
        if (service == NpServiceType.POSTOMAT && !settings.get(POSTOMAT_ENABLED, true)) {
            throw new DomainException.BadRequest(OrderError.NP_POSTOMAT_DISABLED);
        }
        String name = wh.getDescription() == null || wh.getDescription().isBlank() ? null : wh.getDescription();
        return new Resolved(service, name);
    }

    /**
     * Parcel locker limits need the weight and the box of the goods (the parcel sizing of the waybills); until that
     * is ported the waybill dialog is where an oversized parcel shows up, as before the checkout check existed.
     */
    @Override
    public void checkPostomatFits(String warehouseRef, List<CreateOrderCommand.Line> lines) {
        // Intentionally lenient until ParcelSizeService (weights / boxes) lands in the delivery module.
    }
}
