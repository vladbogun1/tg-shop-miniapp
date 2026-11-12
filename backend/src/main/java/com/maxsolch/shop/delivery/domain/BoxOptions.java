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

    /** «Коробка 5 кг · 13 см» for a cut-down box, the plain name at full height. */
    public static String label(String name, int heightMm, boolean full) {
        return full ? name : name + " · " + cm(heightMm) + " см";
    }

    /** 130 → «13», 85 → «8,5». */
    public static String cm(int mm) {
        return mm % 10 == 0 ? String.valueOf(mm / 10) : (mm / 10) + "," + (mm % 10);
    }
}
