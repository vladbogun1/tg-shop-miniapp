package com.maxsolch.shop.delivery.domain;

import java.util.Map;

/**
 * Nova Poshta status code → {@link ShipmentStage}. The codes of the old API (getStatusDocuments)
 * and of the new REST / webhooks agree for 1–12 and 101–112; the new-only ones (107, 113, 141…)
 * are mapped too, so the poll and the webhook read one table. An unknown code gives null: the
 * caller logs it and keeps the stage (.claude/skills/nova-poshta/tracking.md).
 */
public final class ShipmentStatusMapper {

    private ShipmentStatusMapper() {
    }

    private static final Map<Integer, ShipmentStage> STAGES = Map.ofEntries(
            // waybill made, not handed over yet
            Map.entry(1, ShipmentStage.CREATED),
            Map.entry(12, ShipmentStage.CREATED),
            Map.entry(2, ShipmentStage.CANCELLED),
            Map.entry(3, ShipmentStage.NOT_FOUND),
            // accepted and moving (incl. redirect, a failed courier attempt, a moved date)
            Map.entry(4, ShipmentStage.IN_TRANSIT),
            Map.entry(41, ShipmentStage.IN_TRANSIT),
            Map.entry(5, ShipmentStage.IN_TRANSIT),
            Map.entry(6, ShipmentStage.IN_TRANSIT),
            Map.entry(13, ShipmentStage.IN_TRANSIT),
            Map.entry(14, ShipmentStage.IN_TRANSIT),
            Map.entry(16, ShipmentStage.IN_TRANSIT),
            Map.entry(70, ShipmentStage.IN_TRANSIT),
            Map.entry(80, ShipmentStage.IN_TRANSIT),
            Map.entry(81, ShipmentStage.IN_TRANSIT),
            Map.entry(99, ShipmentStage.IN_TRANSIT),
            Map.entry(101, ShipmentStage.IN_TRANSIT),
            Map.entry(104, ShipmentStage.IN_TRANSIT),
            Map.entry(110, ShipmentStage.IN_TRANSIT),
            Map.entry(111, ShipmentStage.IN_TRANSIT),
            Map.entry(112, ShipmentStage.IN_TRANSIT),
            Map.entry(138, ShipmentStage.IN_TRANSIT),
            // waiting for the customer
            Map.entry(7, ShipmentStage.ARRIVED),
            Map.entry(8, ShipmentStage.ARRIVED),
            Map.entry(107, ShipmentStage.ARRIVED),
            Map.entry(149, ShipmentStage.ARRIVED),
            // picked up
            Map.entry(9, ShipmentStage.RECEIVED),
            Map.entry(10, ShipmentStage.RECEIVED),
            Map.entry(11, ShipmentStage.RECEIVED),
            Map.entry(106, ShipmentStage.RECEIVED),
            // refused / coming back
            Map.entry(103, ShipmentStage.REFUSED),
            Map.entry(108, ShipmentStage.REFUSED),
            Map.entry(102, ShipmentStage.RETURNING),
            Map.entry(105, ShipmentStage.RETURNING),
            Map.entry(113, ShipmentStage.RETURNING),
            Map.entry(141, ShipmentStage.RETURNING),
            Map.entry(144, ShipmentStage.RETURNING),
            Map.entry(155, ShipmentStage.RETURNING));

    /** The stage for a status code ("7", " 103 ", 41); null when unknown or not a number. */
    public static ShipmentStage stageOf(String code) {
        return stageOf(code, Map.of());
    }

    /** Same, the admin's own codes («Свои коды статусов») first. */
    public static ShipmentStage stageOf(String code, Map<Integer, ShipmentStage> overrides) {
        if (code == null) {
            return null;
        }
        try {
            int c = Integer.parseInt(code.trim());
            ShipmentStage own = overrides == null ? null : overrides.get(c);
            return own != null ? own : STAGES.get(c);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** «115 = IN_TRANSIT» per line (stage names only); bad lines are skipped. */
    public static Map<Integer, ShipmentStage> parseOverrides(String raw) {
        Map<Integer, ShipmentStage> out = new java.util.HashMap<>();
        if (raw == null || raw.isBlank()) {
            return out;
        }
        for (String line : raw.split("\\R")) {
            String[] kv = line.split("[=:]", 2);
            if (kv.length != 2) {
                continue;
            }
            try {
                out.put(Integer.parseInt(kv[0].trim()),
                        ShipmentStage.valueOf(kv[1].trim().toUpperCase(java.util.Locale.ROOT)));
            } catch (IllegalArgumentException e) {
                // a typo in one line does not drop the others
            }
        }
        return out;
    }

    /**
     * NP accepted the parcel: the order counts as shipped from here on (owner, 2026-10-23 —
     * SHIPPED at code 4+, before that the order only shows «ТТН создана»).
     */
    public static boolean handedOver(ShipmentStage stage) {
        return stage == ShipmentStage.IN_TRANSIT || stage == ShipmentStage.ARRIVED
                || stage == ShipmentStage.RECEIVED || stage == ShipmentStage.REFUSED
                || stage == ShipmentStage.RETURNING;
    }

    /** Russian label for the admin (the customer's apps translate the stage themselves). */
    public static String labelRu(ShipmentStage stage) {
        return switch (stage) {
            case CREATED -> "ТТН создана, посылку ещё не сдали";
            case IN_TRANSIT -> "В пути";
            case ARRIVED -> "Ждёт в отделении";
            case RECEIVED -> "Получена";
            case REFUSED -> "Отказ получателя";
            case RETURNING -> "Возврат отправителю";
            case CANCELLED -> "ТТН удалена";
            case NOT_FOUND -> "ТТН не найдена в Новой почте";
        };
    }
}
