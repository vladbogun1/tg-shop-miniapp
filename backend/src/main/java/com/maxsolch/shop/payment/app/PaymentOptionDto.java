package com.maxsolch.shop.payment.app;

import org.springframework.lang.Nullable;

import java.util.List;

public record PaymentOptionDto(
        String id,
        String title,
        String description,
        boolean requiresPrepayment,
        long prepaymentMinor,
        /** Null = paid online; ON_DELIVERY = all on delivery at Nova Poshta (V98). */
        @Nullable String kind,
        /** Deliveries it is offered for (WAREHOUSE / POSTOMAT / DOORS / PICKUP); empty = all. */
        List<String> deliveryMethods,
        /** Highest order total the option accepts, minor units; null = no limit. */
        @Nullable Long maxTotalMinor) {

    /** An online option offered for every delivery. */
    public PaymentOptionDto(String id, String title, String description, boolean requiresPrepayment,
                            long prepaymentMinor) {
        this(id, title, description, requiresPrepayment, prepaymentMinor, null, List.of(), null);
    }
}
