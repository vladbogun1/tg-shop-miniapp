package com.maxsolch.shop.delivery.domain;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

/** Reading Nova Poshta's answers: its dates in three spellings, text fields, cut notes. Pure. */
public final class NpJson {

    private static final DateTimeFormatter[] DATE_TIME_FORMATS = {
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"),
            DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm:ss"),
            DateTimeFormatter.ofPattern("dd-MM-yyyy HH:mm:ss"),
    };

    private static final String[] DATE_FORMATS = {"yyyy-MM-dd", "dd.MM.yyyy", "dd-MM-yyyy"};

    private NpJson() {
    }

    /** NP dates come as "2026-10-24 00:00:00", "24.10.2026 13:00:00" or a bare date; "0001-…" = none. */
    public static LocalDate date(String raw) {
        if (raw == null || raw.isBlank() || raw.startsWith("0000") || raw.startsWith("0001")) {
            return null;
        }
        String s = raw.trim();
        for (DateTimeFormatter f : DATE_TIME_FORMATS) {
            try {
                return LocalDateTime.parse(s, f).toLocalDate();
            } catch (DateTimeParseException ignored) {
                // next
            }
        }
        for (String p : DATE_FORMATS) {
            try {
                return LocalDate.parse(s.length() > 10 ? s.substring(0, 10) : s, DateTimeFormatter.ofPattern(p));
            } catch (DateTimeParseException ignored) {
                // next
            }
        }
        return null;
    }

    /** A field as text; null when absent or JSON null. */
    public static String text(JsonNode n, String f) {
        JsonNode v = n == null ? null : n.get(f);
        return v == null || v.isNull() ? null : v.asText();
    }

    /** A field as trimmed text; null when absent or blank. */
    public static String trimmed(JsonNode n, String f) {
        String v = text(n, f);
        return v == null || v.isBlank() ? null : v.trim();
    }

    public static String cut(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }

    /** NP money in hryvnias ("105.5") as kopecks; null when absent. */
    public static Long minor(JsonNode n, String f) {
        return n != null && n.hasNonNull(f) ? Math.round(n.get(f).asDouble() * 100) : null;
    }
}
