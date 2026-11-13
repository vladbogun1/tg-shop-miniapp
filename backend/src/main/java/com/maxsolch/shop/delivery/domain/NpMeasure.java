package com.maxsolch.shop.delivery.domain;

import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;

/**
 * What Nova Poshta measured at the branch ({@code getStatusDocuments}: {@code DocumentWeight}, {@code VolumeWeight},
 * {@code FactualWeight} in kg, {@code DocumentCost} in hryvnias — numbers or strings, «1.90», «5.00», 5). Grams and
 * kopecks; absent, blank, zero or unreadable = null. Pure.
 */
public record NpMeasure(Integer weightG, Integer volumeWeightG, Integer factualWeightG, Long costMinor) {

    public static final NpMeasure NONE = new NpMeasure(null, null, null, null);

    /** The measure fields of one tracking row. */
    public static NpMeasure of(JsonNode n) {
        return new NpMeasure(grams(n, "DocumentWeight"), grams(n, "VolumeWeight"), grams(n, "FactualWeight"),
                minor(n, "DocumentCost"));
    }

    public boolean empty() {
        return weightG == null && volumeWeightG == null && factualWeightG == null && costMinor == null;
    }

    /**
     * NP has the parcel (status code 4 and up: in transit, arrived, received, returns…): only then the measure is the
     * branch's and not our own declaration echoed back. 1–3 (created, deleted, not found) and unknown text — no.
     */
    public static boolean accepted(String statusCode) {
        if (statusCode == null) {
            return false;
        }
        try {
            return Integer.parseInt(statusCode.trim()) >= 4;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    static Integer grams(JsonNode n, String f) {
        BigDecimal kg = number(n, f);
        return kg == null ? null : kg.movePointRight(3).setScale(0, java.math.RoundingMode.HALF_UP).intValueExact();
    }

    /** NP money in hryvnias («5400», «2100.00», 5400) as kopecks; absent, blank, zero or unreadable = null. */
    public static Long minor(JsonNode n, String f) {
        BigDecimal uah = number(n, f);
        return uah == null ? null : uah.movePointRight(2).setScale(0, java.math.RoundingMode.HALF_UP).longValueExact();
    }

    /** A positive number from a JSON number or string («1.90», «1,90», 5); anything else null. */
    private static BigDecimal number(JsonNode n, String f) {
        JsonNode v = n == null ? null : n.get(f);
        if (v == null || v.isNull()) {
            return null;
        }
        try {
            BigDecimal d = v.isNumber() ? v.decimalValue() : new BigDecimal(v.asText().trim().replace(',', '.'));
            return d.signum() > 0 && d.compareTo(BigDecimal.valueOf(1_000_000)) < 0 ? d : null;
        } catch (NumberFormatException | ArithmeticException e) {
            return null;
        }
    }
}
