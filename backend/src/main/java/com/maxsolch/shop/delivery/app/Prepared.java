package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.Parcel;
import com.maxsolch.shop.order.domain.NpServiceType;

import java.time.LocalDate;
import java.util.List;

/**
 * Everything a waybill of the order needs, read before any NP call (no transaction is open while NP answers).
 *
 * @param problems blocking: no waybill until they are fixed
 * @param warnings NP may refuse or charge more
 * @param active    the order's active waybill now (null = none)
 * @param suggested the box the system suggests for these goods (memory or sizes), null in old callers
 */
record Prepared(String orderId, String shortId, String status, NpServiceType service, String cityRef,
                String cityName, String destRef, String destination, String streetRef, String streetName,
                String building, String flat, String phone, String lastName, String firstName, String middleName,
                Parcel parcel, long declaredMinor, long codMinor, boolean collectCod,
                String description, LocalDate date, NovaPoshtaSenderService.SenderConfig sender,
                NovaPoshtaSenderService.SenderWarehouse from, List<String> problems, List<String> warnings,
                boolean unpaid, long amountDueMinor, OrderShipment active, String goodsKey, String recipientKey,
                BoxSuggestion.Suggested suggested) {

    /** What NP answered for a saved waybill (or the dry run made up). */
    record NpResult(String ref, String number, Long costMinor, LocalDate estimatedDelivery) {
    }
}
