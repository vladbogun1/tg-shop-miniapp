package com.maxsolch.shop.delivery.domain;

import com.maxsolch.shop.delivery.domain.ParcelPacking.BoxPreset;
import com.maxsolch.shop.delivery.domain.ParcelPacking.Unit;
import com.maxsolch.shop.platform.util.UuidUtil;

import java.util.ArrayList;
import java.util.List;

/**
 * The boxes of {@code np_boxes} as {@link ParcelPacking} sees them, pure. A box with fold lines is one preset per
 * height («Коробка 5 кг · 13 см»; the full height keeps the plain name), so the packing picks a cut-down box for
 * flat goods. A bag is one preset as thick as the goods: the sum of each unit's smallest side, 10–120 mm.
 */
public final class BoxOptions {

    public static final int BAG_MIN_MM = 10;
    public static final int BAG_MAX_MM = 120;
    /** Room around the goods in a bag, per side pair: the soft bag is wrapped around them, not filled. */
    public static final int BAG_MARGIN_MM = 20;
    /** NP's volumetric divisor: cm³ / 4000 = kg, so mm³ / 4 000 000 = kg (4000 mm³ = 1 g). */
    private static final long MM3_PER_G = 4000;

    private BoxOptions() {
    }

    /**
     * One way to use a box: at this height ({@code full} = not cut down). {@code label} is what the waybill dialog,
     * the packer and the journal show.
     */
    public record Option(String boxId, String code, String name, String label, String kind, int lengthMm,
                         int widthMm, int heightMm, boolean full, int tareG, long packMinor) {

        public BoxPreset preset() {
            return new BoxPreset(label, lengthMm, widthMm, heightMm, tareG, packMinor);
        }
    }

    /** Every box at every fold height; bags as thick as {@code units} (null = bags left out: no goods to size them). */
    public static List<Option> expand(List<NpBox> boxes, List<Unit> units) {
        List<Option> out = new ArrayList<>();
        for (NpBox b : boxes) {
            if (b.bag()) {
                if (units != null) {
                    out.add(option(b, bagHeight(units)));
                }
                continue;
            }
            for (int h : b.heights()) {
                out.add(option(b, h));
            }
        }
        return out;
    }

    public static List<BoxPreset> presets(List<NpBox> boxes, List<Unit> units) {
        return expand(boxes, units).stream().map(Option::preset).toList();
    }

    /** {@code box} at {@code heightMm} (a bag: the thickness given). */
    public static Option option(NpBox box, int heightMm) {
        List<Integer> heights = box.heights();
        boolean full = box.bag() || heights.isEmpty() || heights.get(0) == heightMm;
        return new Option(UuidUtil.toString(box.getId()), box.getCode(), box.getName(),
                label(box.getName(), heightMm, full), box.getKind(), box.getLengthMm(), box.getWidthMm(), heightMm,
                full, box.getTareG(), box.getPackMinor());
    }

    /** Whether the box can stand at this height: one of its fold heights; a bag — any thickness within the limits. */
    public static boolean allows(NpBox box, int heightMm) {
        return box.bag() ? heightMm >= BAG_MIN_MM && heightMm <= BAG_MAX_MM : box.heights().contains(heightMm);
    }

    /** The goods' thickness in a bag: each unit lies flat on its smallest side, stacked; 10–120 mm. */
    public static int bagHeight(List<Unit> units) {
        long sum = 0;
        for (Unit u : units) {
            sum += u.sorted()[0];
        }
        return (int) Math.max(BAG_MIN_MM, Math.min(BAG_MAX_MM, sum));
    }

    /**
     * What NP measures of a soft bag: the goods wrapped in it, not the empty bag laid flat. Length = the longest
     * side of the goods, width = the longest middle side, each + {@link #BAG_MARGIN_MM}, never more than the bag.
     * {@code {length, width}}; the bag's own sides when there are no goods to size it.
     * «Пакет полиэтиленовый S» 49×39 cm with IEM + ear tips (order #e90378e3, 13.11.2026) went as 49×39×12 cm —
     * 5.73 kg by volume for 670 g; the goods make 17×12×12 cm.
     */
    public static int[] bagFootprint(int bagLengthMm, int bagWidthMm, List<Unit> units) {
        int l = Math.max(bagLengthMm, bagWidthMm);
        int w = Math.min(bagLengthMm, bagWidthMm);
        int gl = 0;
        int gw = 0;
        for (Unit u : units) {
            int[] d = u.sorted();
            gl = Math.max(gl, d[2]);
            gw = Math.max(gw, d[1]);
        }
        if (gl == 0 || gw == 0) {
            return new int[] {l, w};
        }
        return new int[] {Math.min(l, gl + BAG_MARGIN_MM), Math.min(w, gw + BAG_MARGIN_MM)};
    }

    /**
     * A one-seat parcel the packing put into a bag, as NP measures it: the goods wrapped in the bag
     * ({@link #bagFootprint}), not the bag laid flat. The packing picks a bag by its full size (the goods must fill
     * no more than its fill factor); only the result is cut down. Other parcels as they are.
     */
    public static Parcel wrapBag(Parcel p, List<NpBox> boxes, List<Unit> units) {
        if (p.seats().size() != 1) {
            return p;
        }
        Parcel.Seat s = p.seats().get(0);
        for (NpBox b : boxes) {
            if (b.bag() && b.getName().equals(s.box())) {
                int[] fp = bagFootprint(b.getLengthMm(), b.getWidthMm(), units);
                Parcel.Seat wrapped = new Parcel.Seat(s.weightG(), fp[0], fp[1], s.heightMm(), s.box());
                return new Parcel(p.weightG(), fp[0], fp[1], p.heightMm(), p.source(), List.of(wrapped),
                        p.packMinor(), p.documents());
            }
        }
        return p;
    }

    /** NP's volumetric weight of these sides, g (rounded up). */
    public static long volumeWeightG(int lengthMm, int widthMm, int heightMm) {
        long mm3 = (long) lengthMm * widthMm * heightMm;
        return (mm3 + MM3_PER_G - 1) / MM3_PER_G;
    }

    /**
     * A bag NP would charge by volume far above its weight (2.5× and over 1.5 kg): the sizes are likely wrong
     * (category defaults, not measured) — say so before the waybill is made. Null when it looks right.
     */
    public static String bagVolumeWarning(int lengthMm, int widthMm, int heightMm, int weightG) {
        long vol = volumeWeightG(lengthMm, widthMm, heightMm);
        if (vol <= Math.max(1500, 5L * Math.max(weightG, 500) / 2)) {
            return null;
        }
        return "НП посчитает пакет " + cm(lengthMm) + "×" + cm(widthMm) + "×" + cm(heightMm) + " см как "
                + kg(vol) + " кг по объёму при весе " + kg(weightG) + " кг — проверьте размеры товаров "
                + "или выберите коробку";
    }

    /** 5733 → «5,73». */
    private static String kg(long g) {
        long c = (g + 5) / 10;
        return c / 100 + "," + (c % 100 < 10 ? "0" : "") + c % 100;
    }

    /**
     * A soft bag folded to go into a parcel locker's cell ({@code cell}: sides in mm, smallest first): its footprint
     * is cut down to the cell's two larger sides, when every unit still lies flat in it. {@code {length, width}}
     * folded, or null when it already fits or the goods are too big to fold it (then it does not go in at all).
     * «Пакет НП» 55×50 cm with keycaps into a 60×40×30 locker (order #5e9f3f1a, 13.11.2026) → 55×40.
     */
    public static int[] foldBag(int lengthMm, int widthMm, int heightMm, List<Unit> units, int[] cell) {
        int l = Math.max(lengthMm, widthMm);
        int w = Math.min(lengthMm, widthMm);
        int fl = Math.min(l, cell[2]);
        int fw = Math.min(w, cell[1]);
        if ((fl == l && fw == w) || heightMm > cell[0]) {
            return null;
        }
        for (Unit u : units) {
            int[] d = u.sorted();
            if (d[2] > fl || d[1] > fw) {
                return null;
            }
        }
        return new int[] {fl, fw};
    }

    /** «Коробка 5 кг · 13 см» for a cut-down box, the plain name at full height. */
    public static String label(String name, int heightMm, boolean full) {
        return full ? name : name + " · " + cm(heightMm) + " см";
    }

    /** 130 → «13», 85 → «8,5». */
    public static String cm(int mm) {
        return mm % 10 == 0 ? String.valueOf(mm / 10) : (mm / 10) + "," + (mm % 10);
    }
}
