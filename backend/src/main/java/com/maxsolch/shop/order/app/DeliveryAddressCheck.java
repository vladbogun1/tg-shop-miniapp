package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.NpServiceType;
import org.springframework.lang.Nullable;

import java.util.List;

/**
 * The server's word on the Nova Poshta part of a checkout: the city / branch / street exist in the directory, the
 * branch belongs to the city, the service type follows the branch's kind (the map lets one pick a parcel locker in
 * the branch list), parcel lockers and courier are switched on, the order fits a parcel locker. Declared by the
 * order module, implemented by {@code delivery} (which owns the directory). The required fields (city, branch,
 * street + house) are checked by the order before this is called. Errors are {@code OrderError} constants.
 */
public interface DeliveryAddressCheck {

    /**
     * Checks the address and says how it is delivered.
     *
     * @throws com.maxsolch.shop.platform.error.DomainException with an {@code OrderError} when it cannot be
     *                                                          delivered there
     */
    Resolved check(Address address);

    /**
     * The order (its lines) fits the parcel locker {@code warehouseRef} — weight and box. Called only for
     * POSTOMAT, after {@link #check}.
     *
     * @throws com.maxsolch.shop.platform.error.DomainException {@code OrderError.NP_POSTOMAT_TOO_BIG}
     */
    void checkPostomatFits(String warehouseRef, List<CreateOrderCommand.Line> lines);

    /**
     * What the customer chose.
     *
     * @param serviceType  WAREHOUSE (also when a parcel locker was picked in the branch list) | POSTOMAT | DOORS
     * @param warehouseRef branch / parcel locker, for WAREHOUSE and POSTOMAT
     * @param streetRef    courier street from the directory; null when typed by hand
     */
    record Address(NpServiceType serviceType, String cityRef, @Nullable String warehouseRef,
                   @Nullable String streetRef, @Nullable String streetName, @Nullable String building) {
    }

    /**
     * @param serviceType   the service type to store (the branch's kind decides WAREHOUSE vs POSTOMAT)
     * @param warehouseName the directory's name of the branch (the order and the waybill show it, not what the
     *                      client sent); null = keep the client's (courier, or the directory has none)
     */
    record Resolved(NpServiceType serviceType, @Nullable String warehouseName) {
    }
}
