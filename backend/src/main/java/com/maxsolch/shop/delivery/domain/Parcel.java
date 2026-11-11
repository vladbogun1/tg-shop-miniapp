package com.maxsolch.shop.delivery.domain;

import java.util.List;

/**
 * A parcel of a waybill. Grams and millimetres: {@code weightG} is the whole parcel, the sides are the first
 * seat's (the only one in most orders); {@code seats} lists every seat. {@code packMinor} is what the branch charges
 * for the boxes (the customer pays it with the delivery). {@code source} says where the size came from (preview).
 */
public record Parcel(int weightG, int lengthMm, int widthMm, int heightMm, String source, List<Seat> seats,
                     long packMinor, boolean documents) {

    /** One seat (місце) of the waybill: grams with the box, millimetres; {@code box} = preset name or null. */
    public record Seat(int weightG, int lengthMm, int widthMm, int heightMm, String box) {
    }

    public Parcel {
        seats = seats == null || seats.isEmpty()
                ? List.of(new Seat(weightG, lengthMm, widthMm, heightMm, null)) : List.copyOf(seats);
    }

    public Parcel(int weightG, int lengthMm, int widthMm, int heightMm, String source, List<Seat> seats,
                  long packMinor) {
        this(weightG, lengthMm, widthMm, heightMm, source, seats, packMinor, false);
    }

    /** One seat of these sides (typed in by hand, or no presets). */
    public Parcel(int weightG, int lengthMm, int widthMm, int heightMm, String source) {
        this(weightG, lengthMm, widthMm, heightMm, source, null, 0);
    }

    /** The same parcel sent as «Документи» (or back as a parcel). */
    public Parcel withDocuments(boolean on) {
        return on == documents ? this : new Parcel(weightG, lengthMm, widthMm, heightMm,
                on ? "«Документи» (плоские товары до " + weightG + " г)" : source, seats, packMinor, on);
    }

    /** NP CargoType of this parcel. */
    public String cargoType() {
        return documents ? "Documents" : "Parcel";
    }

    public static Parcel of(List<Seat> seats, String source, long packMinor) {
        Seat first = seats.get(0);
        int weight = seats.stream().mapToInt(Seat::weightG).sum();
        return new Parcel(weight, first.lengthMm(), first.widthMm(), first.heightMm(), source, seats, packMinor);
    }

    public double weightKg() {
        return Math.max(0.1, weightG / 1000.0);
    }

    /** NP volumetric weight, kg: L×W×H (cm) / 4000, over all seats. */
    public double volumetricKg() {
        return seats.stream().mapToDouble(s -> (s.lengthMm() / 10.0) * (s.widthMm() / 10.0) * (s.heightMm() / 10.0) / 4000.0)
                .sum();
    }
}
