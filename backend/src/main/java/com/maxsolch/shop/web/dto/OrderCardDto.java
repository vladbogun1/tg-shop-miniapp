package com.maxsolch.shop.web.dto;

import java.time.Instant;

public record OrderCardDto(
        String id,
        String customerName,
        long totalMinor,
        String currency,
        int itemsCount,
        String deliveryMethod,
        String paymentOptionTitle,
        long unreadCount,
        Instant createdAt,
        String status,
        boolean paid,
        /** Amount received (online payments + admin-recorded), so the card can tell a partial payment from a full one. */
        long receivedMinor,
        /** Deadline to pay online; null for orders placed before online payment existed. */
        Instant paymentDueAt,
        /** Still to pay online right now (0 once the online part — whole order or prepayment — is covered). */
        long amountDueMinor,
        /** MINIAPP | WEB | ADMIN — where the order was placed. */
        String source,
        /** PENDING | APPROVED | DECLINED — customer's cancellation request; null = none. */
        String cancelRequestStatus,
        /** In the archive (V68): shown only with the «Архив» filter / in a customer's profile. */
        boolean archived,
        /** IN_TRANSIT | RECEIVED | null — refused parcel on its way back (V68). */
        String returnStatus,
        /** Units on their way back right now (the «Едет назад» card shows only these). */
        int returningUnits,
        /** Units already given back (received / restocked / written off) — «Возврат 1 из 3» on the card. */
        int returnedUnits,
        /** What is in the order, for the picture strip on the card. */
        java.util.List<CardLine> lines,
        /** This order is the replacement of an exchange on that order (V69); null = not. */
        String exchangeOfId,
        /** Replacement orders created by exchanges on this one (V69), oldest first. */
        java.util.List<String> exchangeOrderIds,
        /** Refused at the Nova Poshta branch (partial pickup, V72): the card shows total − this. */
        long uncollectedMinor) {

    /**
     * @param returning units of this line on their way back
     * @param returned  units of this line already given back
     */
    public record CardLine(String imageUrl, String title, int quantity, int returning, int returned, boolean gift) {
    }
}
