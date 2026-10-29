package com.maxsolch.shop.order.app;

import jakarta.validation.constraints.NotBlank;

public record UpdateOrderStatusRequest(
        @NotBlank String status,
        String trackingNumber,
        String rejectReason,
        /** For REJECTED: return items to stock? null = true (default). */
        Boolean restock,
        /** For REJECTED: RejectReasonCode name (NO_RESPONSE, CHANGED_MIND, …); text is then optional. */
        String rejectReasonCode,
        /** For SHIPPED: the admin confirmed shipping although the online payment has not arrived. */
        Boolean shipUnpaid,
        /**
         * For REJECTED of a SHIPPED order: the parcel was refused and is coming back — nothing is
         * restocked now, the order waits as «посылка едет назад» (V68).
         */
        Boolean returnInTransit) {
}
