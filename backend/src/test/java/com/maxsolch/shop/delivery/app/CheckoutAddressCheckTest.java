package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.NovaPoshtaWarehouse;
import com.maxsolch.shop.delivery.infra.NovaPoshtaWarehouseRepository;
import com.maxsolch.shop.order.app.DeliveryAddressCheck;
import com.maxsolch.shop.order.domain.NpServiceType;
import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.settings.app.SettingsService;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** A customer's branch is checked against the local Nova Poshta directory: in the city, and still open. */
class CheckoutAddressCheckTest {

    private final NovaPoshtaWarehouseRepository warehouses = mock(NovaPoshtaWarehouseRepository.class);
    private final SettingsService settings = mock(SettingsService.class);
    private final CheckoutAddressCheck check =
            new CheckoutAddressCheck(warehouses, settings, mock(ParcelSizeService.class));

    private NovaPoshtaWarehouse branch(String ref, boolean active) {
        NovaPoshtaWarehouse w = new NovaPoshtaWarehouse();
        w.setRef(ref);
        w.setCityRef("city-1");
        w.setDescription("Відділення №1 (з довідника)");
        w.setType("Branch");
        w.setActive(active);
        when(warehouses.findById(ref)).thenReturn(Optional.of(w));
        return w;
    }

    private DeliveryAddressCheck.Address at(String cityRef, String whRef) {
        return new DeliveryAddressCheck.Address(NpServiceType.WAREHOUSE, cityRef, whRef, null, null, null);
    }

    private static void assertUnknown(Runnable r) {
        assertThatThrownBy(r::run).isInstanceOfSatisfying(DomainException.class,
                e -> assertThat(e.errorCode()).isEqualTo(OrderError.NP_WAREHOUSE_UNKNOWN));
    }

    @Test
    void openBranchInTheCity_nameFromTheDirectory() {
        when(settings.get(anyString(), anyBoolean())).thenAnswer(inv -> inv.getArgument(1));
        branch("wh-1", true);

        DeliveryAddressCheck.Resolved r = check.check(at("city-1", "wh-1"));

        assertThat(r.serviceType()).isEqualTo(NpServiceType.WAREHOUSE);
        assertThat(r.warehouseName()).isEqualTo("Відділення №1 (з довідника)");
    }

    @Test
    void closedBranch_otherCity_unknownRef_areRefused() {
        branch("wh-closed", false);
        branch("wh-1", true);

        assertUnknown(() -> check.check(at("city-1", "wh-closed")));
        assertUnknown(() -> check.check(at("city-2", "wh-1")));
        assertUnknown(() -> check.check(at("city-1", "nope")));
    }
}
