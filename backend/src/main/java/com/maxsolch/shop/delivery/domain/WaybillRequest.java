package com.maxsolch.shop.delivery.domain;

import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * Builds {@code InternetDocument.save / update} properties (API 2.0). Pure, unit-tested: the
 * recipient always pays the delivery in cash (owner, 2026-10-23), money for the goods goes through
 * «Контроль оплати» ({@code AfterpaymentOnGoodsCost}), the order number rides in
 * {@code InfoRegClientBarcodes} so it shows in NP tracking.
 */
public final class WaybillRequest {

    /** NP takes a Parcel up to 30 kg; heavier is Cargo (not for a parcel locker). */
    static final int PARCEL_MAX_G = 30_000;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    private WaybillRequest() {
    }

    /** A side of the waybill: counterparty + contact + phone + city + branch (or address) ref. */
    public record Party(String counterpartyRef, String contactRef, String phone, String cityRef, String addressRef) {
    }

    /**
     * @param ref           the waybill Ref for {@code update}; null for {@code save}
     * @param declaredMinor declared value (Cost), kopecks; rounded up to whole hryvnias
     * @param codMinor      money NP collects for the goods (AfterpaymentOnGoodsCost); 0 = none
     * @param barcode       our order number (InfoRegClientBarcodes)
     */
    public record Spec(String ref, Party sender, Party recipient, String serviceType, boolean postomat,
                       Parcel parcel, long declaredMinor, long codMinor,
                       String description, LocalDate date, String barcode, String note) {
    }

    public static ObjectNode build(Spec s) {
        ObjectNode p = JsonNodeFactory.instance.objectNode();
        if (s.ref() != null) {
            p.put("Ref", s.ref());
        }
        p.put("PayerType", "Recipient");
        p.put("PaymentMethod", "Cash");
        p.put("DateTime", s.date().format(DATE));
        p.put("CargoType", cargoType(s.parcel(), s.postomat()));
        p.put("ServiceType", s.serviceType());
        p.put("SeatsAmount", String.valueOf(s.parcel().seats().size()));
        p.put("Weight", weight(s.parcel()));
        if (!s.parcel().documents()) {
            // «Документи» have no volume for NP: it refuses one («VolumeWeight must be empty», order #5183559b).
            p.put("VolumeGeneral", m3(s.parcel()));
        }
        p.put("Description", s.description() == null || s.description().isBlank() ? "Товари" : s.description().trim());
        // The declared value is at least what NP collects: «Контроль оплати» cannot exceed it.
        p.put("Cost", uahCeil(Math.max(s.declaredMinor(), s.codMinor())));

        p.put("CitySender", s.sender().cityRef());
        p.put("Sender", s.sender().counterpartyRef());
        p.put("SenderAddress", s.sender().addressRef());
        p.put("ContactSender", s.sender().contactRef());
        p.put("SendersPhone", s.sender().phone());

        p.put("CityRecipient", s.recipient().cityRef());
        p.put("Recipient", s.recipient().counterpartyRef());
        p.put("RecipientAddress", s.recipient().addressRef());
        p.put("ContactRecipient", s.recipient().contactRef());
        p.put("RecipientsPhone", s.recipient().phone());

        if (s.barcode() != null && !s.barcode().isBlank()) {
            p.put("InfoRegClientBarcodes", s.barcode());
        }
        if (s.note() != null && !s.note().isBlank()) {
            p.put("AdditionalInformation", s.note().length() > 100 ? s.note().substring(0, 100) : s.note());
        }
        if (s.codMinor() > 0) {
            p.put("AfterpaymentOnGoodsCost", uah(s.codMinor()));
        }

        if (!s.parcel().documents()) {
            // «Документи» go by weight only: NP zeroes their sides, so no seats are sent.
            seats(p.putArray("OptionsSeat"), s.parcel());
        }
        return p;
    }

    /** Documents (flat goods up to 1 kg, audit §8), Cargo (over 30 kg, not to a locker) or Parcel. */
    public static String cargoType(Parcel parcel, boolean postomat) {
        if (parcel.documents()) {
            return "Documents";
        }
        return parcel.weightG() > PARCEL_MAX_G && !postomat ? "Cargo" : "Parcel";
    }

    /**
     * {@code Weight} of the waybill. «Документи» go at one of NP's three weights only — 0.1, 0.5 or 1 kg, anything
     * else is refused («Weight is not allowed for Documents») — so their weight is rounded up to the next one.
     */
    public static String weight(Parcel parcel) {
        if (!parcel.documents()) {
            return kg(parcel.weightG());
        }
        int g = parcel.weightG();
        return g <= 100 ? "0.1" : g <= 500 ? "0.5" : "1";
    }

    /** {@code OptionsSeat}: one entry per seat with its own sides and weight (NP prices each seat). */
    public static void seats(ArrayNode out, Parcel parcel) {
        for (Parcel.Seat st : parcel.seats()) {
            ObjectNode seat = out.addObject();
            seat.put("volumetricVolume", m3(st.lengthMm(), st.widthMm(), st.heightMm()));
            seat.put("volumetricWidth", cm(st.widthMm()));
            seat.put("volumetricLength", cm(st.lengthMm()));
            seat.put("volumetricHeight", cm(st.heightMm()));
            seat.put("weight", kg(st.weightG()));
        }
    }

    /** Grams → kg for NP ("0.35"), at least 0.1. */
    public static String kg(int grams) {
        BigDecimal kg = BigDecimal.valueOf(Math.max(100, grams)).divide(BigDecimal.valueOf(1000), 3, RoundingMode.UP);
        return kg.stripTrailingZeros().toPlainString();
    }

    /** Millimetres → whole centimetres, rounded up, at least 1. */
    public static String cm(int mm) {
        return String.valueOf(Math.max(1, (mm + 9) / 10));
    }

    /** Volume of all seats in m³ from the centimetre sides NP sees, 4 decimals, at least 0.0001. */
    public static String m3(Parcel p) {
        long cm3 = p.seats().stream().mapToLong(s -> cm3(s.lengthMm(), s.widthMm(), s.heightMm())).sum();
        return m3(cm3);
    }

    public static String m3(int lengthMm, int widthMm, int heightMm) {
        return m3(cm3(lengthMm, widthMm, heightMm));
    }

    private static long cm3(int l, int w, int h) {
        return (long) Integer.parseInt(cm(l)) * Integer.parseInt(cm(w)) * Integer.parseInt(cm(h));
    }

    private static String m3(long cm3) {
        BigDecimal v = BigDecimal.valueOf(cm3).divide(BigDecimal.valueOf(1_000_000), 4, RoundingMode.UP);
        return v.max(new BigDecimal("0.0001")).stripTrailingZeros().toPlainString();
    }

    /** Kopecks → hryvnias as NP writes money ("1250", "1250.5"). */
    public static String uah(long minor) {
        return BigDecimal.valueOf(Math.max(0, minor)).movePointLeft(2).stripTrailingZeros().toPlainString();
    }

    /** Kopecks → whole hryvnias rounded up, at least 1. */
    public static String uahCeil(long minor) {
        return String.valueOf(Math.max(1, (Math.max(0, minor) + 99) / 100));
    }
}
