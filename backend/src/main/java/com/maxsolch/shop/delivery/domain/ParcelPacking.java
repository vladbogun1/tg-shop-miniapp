package com.maxsolch.shop.delivery.domain;

import com.maxsolch.shop.delivery.domain.Parcel.Seat;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Packing the units of an order into seats (shipments audit 2026-10, §5), pure and unit-tested.
 *
 * <p>The smallest preset that holds the largest unit by its sorted sides and whose volume × fill factor (0.6) holds
 * the units' total volume; the seat weighs the units plus the preset's tare. Nothing fits one preset: the largest
 * preset is filled up to the factor and the rest goes to the next seat. A unit bigger than every preset (furniture)
 * is a seat of its own in its own size. Without presets the old rule: one unit as is, several in a box by volume.
 */
public final class ParcelPacking {

    /** At most this many seats; the rest rides in the last one (an order of 50 mice is not a parcel). */
    static final int MAX_SEATS = 10;
    public static final int DEFAULT_FILL_PCT = 60;

    private ParcelPacking() {
    }

    /** One unit of goods: grams, millimetres; {@code sized} = the sides came from the catalog, not the defaults. */
    public record Unit(int weightG, int l, int w, int h, boolean sized) {
        long volume() {
            return (long) l * w * h;
        }

        int[] sorted() {
            int[] d = {l, w, h};
            Arrays.sort(d);
            return d;
        }
    }

    /**
     * A named box of the «Коробки» setting: sides in mm, {@code tareG} = the empty box, {@code packMinor}
     * = what the branch charges for it.
     */
    public record BoxPreset(String name, int lengthMm, int widthMm, int heightMm, int tareG, long packMinor) {
        public BoxPreset(String name, int lengthMm, int widthMm, int heightMm) {
            this(name, lengthMm, widthMm, heightMm, 0, 0);
        }

        long volume() {
            return (long) lengthMm * widthMm * heightMm;
        }

        boolean holds(Unit u) {
            int[] s = sorted();
            int[] d = u.sorted();
            return s[0] >= d[0] && s[1] >= d[1] && s[2] >= d[2];
        }

        int[] sorted() {
            int[] d = {lengthMm, widthMm, heightMm};
            Arrays.sort(d);
            return d;
        }
    }

    public static Parcel pack(List<Unit> units, Unit def, List<BoxPreset> presets) {
        return pack(units, def, presets, DEFAULT_FILL_PCT / 100.0);
    }

    public static Parcel pack(List<Unit> units, Unit def, List<BoxPreset> presets, double fill) {
        if (units.isEmpty()) {
            return new Parcel(def.weightG(), def.l(), def.w(), def.h(), "по умолчанию");
        }
        if (presets == null || presets.isEmpty()) {
            return packByVolume(units);
        }
        List<Seat> seats = new ArrayList<>();
        List<Unit> rest = new ArrayList<>();
        for (Unit u : units) {
            if (presets.stream().anyMatch(p -> p.holds(u))) {
                rest.add(u);
            } else {
                // Bigger than every box (a chair, a desk): its own seat in its own size.
                seats.add(new Seat(u.weightG(), u.l(), u.w(), u.h(), null));
            }
        }
        rest.sort((a, b) -> Long.compare(b.volume(), a.volume()));
        long pack = 0;
        while (!rest.isEmpty()) {
            List<Unit> group = new ArrayList<>();
            BoxPreset box = nextBox(rest, group, presets, fill, seats.size());
            int weight = group.stream().mapToInt(Unit::weightG).sum() + box.tareG();
            seats.add(new Seat(weight, box.lengthMm(), box.widthMm(), box.heightMm(), box.name()));
            pack += box.packMinor();
        }
        return Parcel.of(seats, source(seats, units), pack);
    }

    /** Moves the units of the next seat from {@code rest} to {@code group} and returns its box. */
    private static BoxPreset nextBox(List<Unit> rest, List<Unit> group, List<BoxPreset> presets, double fill,
                                     int seatsSoFar) {
        BoxPreset box = smallest(rest, presets, fill);
        if (box != null || seatsSoFar >= MAX_SEATS - 1) {
            group.addAll(rest);
            rest.clear();
            return box != null ? box : largestHolding(group.get(0), presets);
        }
        // Fill the largest box that takes the biggest unit up to the factor; the rest — next seat.
        BoxPreset big = largestHolding(rest.get(0), presets);
        long vol = 0;
        for (var it = rest.iterator(); it.hasNext(); ) {
            Unit u = it.next();
            if (group.isEmpty() || (big.holds(u) && vol + u.volume() <= fill * big.volume())) {
                group.add(u);
                vol += u.volume();
                it.remove();
            }
        }
        BoxPreset fit = smallest(group, presets, fill);
        return fit != null ? fit : big;
    }

    private static String source(List<Seat> seats, List<Unit> units) {
        if (seats.size() == 1) {
            return seats.get(0).box() != null ? "коробка «" + seats.get(0).box() + "»"
                    : units.get(0).sized() ? "из карточки товара" : "по умолчанию";
        }
        return seats.size() + " места: " + String.join(" + ", seats.stream()
                .map(s -> s.box() != null ? "«" + s.box() + "»" : "своя упаковка").toList());
    }

    /** The smallest preset holding the biggest unit with the total volume within the fill factor. */
    private static BoxPreset smallest(List<Unit> units, List<BoxPreset> presets, double fill) {
        long volume = units.stream().mapToLong(Unit::volume).sum();
        BoxPreset best = null;
        for (BoxPreset p : presets) {
            boolean fits = units.stream().allMatch(p::holds) && volume <= fill * p.volume();
            if (fits && (best == null || p.volume() < best.volume())) {
                best = p;
            }
        }
        return best;
    }

    private static BoxPreset largestHolding(Unit u, List<BoxPreset> presets) {
        BoxPreset best = null;
        for (BoxPreset p : presets) {
            if (p.holds(u) && (best == null || p.volume() > best.volume())) {
                best = p;
            }
        }
        return best;
    }

    /** No presets set up: one unit as is, several in a box with the largest unit's footprint. */
    private static Parcel packByVolume(List<Unit> units) {
        int weight = units.stream().mapToInt(Unit::weightG).sum();
        long volume = 0;
        int[] biggest = {0, 0, 0};
        for (Unit u : units) {
            volume += (long) u.l() * u.w() * u.h();
            int[] d = {u.l(), u.w(), u.h()};
            Arrays.sort(d);
            for (int i = 0; i < 3; i++) {
                biggest[i] = Math.max(biggest[i], d[i]);
            }
        }
        if (units.size() == 1) {
            Unit u = units.get(0);
            return new Parcel(weight, u.l(), u.w(), u.h(), u.sized() ? "из карточки товара" : "по умолчанию");
        }
        // A box with the largest unit's footprint, tall enough for the total volume.
        int h = (int) Math.min(2000, Math.max(biggest[0], Math.ceil((double) volume / ((long) biggest[2] * biggest[1]))));
        return new Parcel(weight, biggest[2], biggest[1], h, "по объёму товаров");
    }

    private static final Pattern PRESET = Pattern.compile(
            "^\\s*(.+?)\\s*[:—-]\\s*(\\d+)\\s*[x×хX*]\\s*(\\d+)\\s*[x×хX*]\\s*(\\d+)\\s*(мм|mm|см|cm)?"
                    + "(?:\\s*[/;,]\\s*(?:тара\\s*)?(\\d+)\\s*(?:г(?!рн)|g)\\.?)?"
                    + "(?:\\s*[/;,]\\s*(?:упаковка\\s*)?(\\d+(?:[.,]\\d{1,2})?)\\s*(?:₴|грн|uah)\\.?)?\\s*$",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    /**
     * «Название: Д×Ш×В / тара г / упаковка ₴» per line, e.g. «Коробка 1 кг: 240×170×98 / 100 г / 15 ₴»
     * (mm; «см» multiplies by 10; tare and the branch's box price may be left out). Bad lines are skipped.
     */
    public static List<BoxPreset> parsePresets(String raw) {
        List<BoxPreset> out = new ArrayList<>();
        if (raw == null) {
            return out;
        }
        for (String line : raw.split("\\R")) {
            Matcher m = PRESET.matcher(line);
            if (!m.matches()) {
                continue;
            }
            int k = m.group(5) != null && (m.group(5).equals("см") || m.group(5).equals("cm")) ? 10 : 1;
            int l = Integer.parseInt(m.group(2)) * k;
            int w = Integer.parseInt(m.group(3)) * k;
            int h = Integer.parseInt(m.group(4)) * k;
            int tare = m.group(6) == null ? 0 : Integer.parseInt(m.group(6));
            long packMinor = m.group(7) == null ? 0
                    : new java.math.BigDecimal(m.group(7).replace(',', '.')).movePointRight(2).longValue();
            if (l > 0 && w > 0 && h > 0) {
                out.add(new BoxPreset(m.group(1), l, w, h, tare, packMinor));
            }
        }
        return out;
    }
}
