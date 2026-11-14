package com.maxsolch.shop.delivery.app;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.Parcel;
import lombok.extern.slf4j.Slf4j;

import java.util.List;
import java.util.regex.Pattern;

/**
 * Several seats (місця) of one waybill as the packer made them — a mat in stretch film and a mouse in a box. The row
 * keeps them as sent ({@code seats_json}, V104) and their label «2 места: Стрейч 49×42 см + Коробка S · 8 см»: an
 * update of the waybill sends the same seats again, never one parcel instead. Rows of v3.71 have the label only.
 */
@Slf4j
final class PackingPlaces {

    /** NP takes more, but a parcel of more seats is not packed at a branch counter by hand. */
    static final int MAX = 10;
    private static final int LABEL_MAX = 120;
    private static final Pattern MULTI = Pattern.compile("^[0-9]+ мест(а|о)?: .*", Pattern.DOTALL);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<List<Parcel.Seat>> SEATS = new TypeReference<>() { };

    private PackingPlaces() {
    }

    /** «2 места: A + B», cut to the column's 120 characters. */
    static String label(List<String> seats) {
        String text = seats.size() + " " + plural(seats.size()) + ": " + String.join(" + ", seats);
        return text.length() <= LABEL_MAX ? text : text.substring(0, LABEL_MAX - 1) + "…";
    }

    /** The waybill row was packed as several seats. */
    static boolean multiLabel(String boxLabel) {
        return boxLabel != null && MULTI.matcher(boxLabel).matches();
    }

    /** The waybill of this row is of several seats: by its stored seats, or by its label (rows before V104). */
    static boolean multi(OrderShipment s) {
        return s != null && (stored(s).size() > 1 || multiLabel(s.getBoxLabel()));
    }

    /** What the row keeps of the parcel sent: its seats when there are two or more, else null. */
    static String json(Parcel p) {
        if (p == null || p.seats().size() < 2) {
            return null;
        }
        try {
            return JSON.writeValueAsString(p.seats());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("seats not written", e);
        }
    }

    /** The seats the waybill was sent with; empty = one seat, or a row of v3.71 that kept only the label. */
    static List<Parcel.Seat> stored(OrderShipment s) {
        String json = s == null ? null : s.getSeatsJson();
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return List.copyOf(JSON.readValue(json, SEATS));
        } catch (JsonProcessingException e) {
            log.warn("NP waybill {}: seats not read ({})", s.getTtn(), e.getOriginalMessage());
            return List.of();
        }
    }

    private static String plural(int n) {
        int tens = n % 100;
        int last = n % 10;
        return tens >= 11 && tens <= 14 || last == 0 || last >= 5 ? "мест" : last == 1 ? "место" : "места";
    }
}
