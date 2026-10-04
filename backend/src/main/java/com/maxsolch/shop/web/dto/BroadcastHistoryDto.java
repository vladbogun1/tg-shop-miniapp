package com.maxsolch.shop.web.dto;

import com.maxsolch.shop.domain.Broadcast;

import java.time.Instant;

/** One past (or running) broadcast for the history list on the «Рассылки» page. */
public record BroadcastHistoryDto(
        long id,
        String adminName,
        String text,
        String textUk,
        String textRu,
        String textEn,
        String audience,
        String lang,
        boolean withButton,
        /** RUNNING | DONE | INTERRUPTED */
        String status,
        int total,
        int sent,
        int failed,
        int blocked,
        Instant startedAt,
        Instant finishedAt) {

    public static BroadcastHistoryDto of(Broadcast b) {
        return new BroadcastHistoryDto(b.getId(), b.getAdminName(), b.getText(), b.getTextUk(), b.getTextRu(),
                b.getTextEn(), b.getAudience(), b.getLang(), b.isWithButton(), b.getStatus(), b.getTotal(),
                b.getSent(), b.getFailed(), b.getBlocked(), b.getStartedAt(), b.getFinishedAt());
    }
}
