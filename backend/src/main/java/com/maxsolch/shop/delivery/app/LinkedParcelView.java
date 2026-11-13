package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.ParcelLink;
import org.springframework.lang.Nullable;

import java.time.Instant;
import java.time.LocalDate;

/**
 * A waybill NP made on the basis of the order's parcel, for the order card («Посылки»).
 *
 * @param kind            RETURN (back to us) | REDIRECT (the customer sent it on) | LIGHT_RETURN (return after pickup)
 * @param stage           CREATED | IN_TRANSIT | ARRIVED | RECEIVED | REFUSED | RETURNING | CANCELLED | NOT_FOUND
 * @param basisTtn        our waybill it was made from
 * @param storagePaidFrom from when NP charges for storage while it waits in the branch
 */
public record LinkedParcelView(
        String kind,
        String ttn,
        String stage,
        @Nullable String statusText,
        @Nullable LocalDate storagePaidFrom,
        @Nullable Instant arrivedAt,
        @Nullable Instant receivedAt,
        @Nullable Instant lastPolledAt,
        @Nullable Instant createdAt,
        String trackingUrl) {

    static LinkedParcelView of(ParcelLink l) {
        return new LinkedParcelView(l.getKind(), l.getTtn(), l.getStage(), l.getStatusText(), l.getStoragePaidFrom(),
                l.getArrivedAt(), l.getReceivedAt(), l.getLastPolledAt(), l.getCreatedAt(),
                ShipmentFacts.trackingUrl(l.getTtn()));
    }
}
