package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.BoxOptions;
import com.maxsolch.shop.delivery.domain.NpBox;
import com.maxsolch.shop.delivery.domain.Parcel;
import com.maxsolch.shop.delivery.domain.Parcel.Seat;
import com.maxsolch.shop.delivery.domain.ParcelPacking.Unit;
import com.maxsolch.shop.delivery.domain.PackingMemoryEntry;
import com.maxsolch.shop.delivery.infra.PackingMemoryStore;
import com.maxsolch.shop.order.app.ShippingOrder;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Which box the order's parcel goes into: the box the packers used most for exactly these goods
 * ({@code np_packing_memory}, the goods fingerprint {@link ShipmentFacts#goodsKey}) while that box is still in the
 * catalog, else {@link ParcelSizeService} over the boxes in stock. «Документи» (flat goods) stay documents: a remembered
 * box does not turn an envelope into a paid parcel.
 */
@Component
class BoxSuggestion {

    static final String BY_SIZE = "подобрано по размерам";

    private final ParcelSizeService parcels;
    private final NpBoxCatalog boxes;
    private final PackingMemoryStore memory;

    BoxSuggestion(ParcelSizeService parcels, NpBoxCatalog boxes, PackingMemoryStore memory) {
        this.parcels = parcels;
        this.boxes = boxes;
        this.memory = memory;
    }

    /**
     * The parcel to declare and what to call its box.
     *
     * @param label  «Коробка 5 кг · 13 см» (several seats: joined with « + »)
     * @param source {@link #BY_SIZE} or «по прошлым заказам ×N»
     */
    record Suggested(Parcel parcel, String label, String source) {
    }

    /** A remembered box of a list row: what to call it and «по прошлым заказам ×N». */
    record Hint(String label, String source) {
    }

    Suggested forOrder(ShippingOrder order) {
        Parcel byRules = parcels.forOrder(order);
        if (!byRules.documents()) {
            Optional<Suggested> remembered = remembered(order);
            if (remembered.isPresent()) {
                return remembered.get();
            }
        }
        return new Suggested(byRules, label(byRules), BY_SIZE);
    }

    /** The most used remembered box of these goods that still exists. */
    private Optional<Suggested> remembered(ShippingOrder order) {
        List<PackingMemoryEntry> entries = memory.boxesFor(List.of(ShipmentFacts.goodsKey(order)));
        if (entries.isEmpty()) {
            return Optional.empty();
        }
        List<Unit> units = parcels.units(order);
        for (PackingMemoryEntry e : entries) {
            Optional<NpBox> box = boxes.find(e.boxId());
            if (box.isPresent() && fits(box.get(), e.heightMm())) {
                return Optional.of(of(box.get(), e, units));
            }
        }
        return Optional.empty();
    }

    private static boolean fits(NpBox box, Integer heightMm) {
        return box.bag() || (heightMm != null && BoxOptions.allows(box, heightMm));
    }

    private static Suggested of(NpBox box, PackingMemoryEntry e, List<Unit> units) {
        int height = box.bag() ? BoxOptions.bagHeight(units) : e.heightMm();
        BoxOptions.Option o = BoxOptions.option(box, height);
        int weight = units.stream().mapToInt(Unit::weightG).sum() + o.tareG();
        String source = remembered(e.uses());
        Seat seat = new Seat(weight, o.lengthMm(), o.widthMm(), o.heightMm(), o.label());
        Parcel p = Parcel.of(List.of(seat), "коробка «" + o.label() + "» — " + source, o.packMinor());
        return new Suggested(p, o.label(), source);
    }

    static String remembered(int uses) {
        return "по прошлым заказам ×" + uses;
    }

    /** «Коробка 2 кг», «Коробка 2 кг + своя упаковка 70×60×35 см». */
    static String label(Parcel p) {
        return String.join(" + ", p.seats().stream().map(s -> s.box() != null ? s.box()
                : (p.documents() ? "конверт («Документи»)" : "своя упаковка " + BoxOptions.cm(s.lengthMm()) + "×"
                + BoxOptions.cm(s.widthMm()) + "×" + BoxOptions.cm(s.heightMm()) + " см")).toList());
    }

    /**
     * The most used remembered box of each goods fingerprint, for a list (one query): fingerprint → its box.
     * Boxes gone from the catalog are skipped. Bags are named without a thickness (no goods at hand).
     */
    Map<String, Hint> rememberedLabels(Collection<String> goodsSigs) {
        Map<String, Hint> out = new LinkedHashMap<>();
        if (goodsSigs.isEmpty()) {
            return out;
        }
        Map<String, Optional<NpBox>> seen = new LinkedHashMap<>();
        for (PackingMemoryEntry e : memory.boxesFor(goodsSigs)) {
            if (out.containsKey(e.goodsSig())) {
                continue;
            }
            Optional<NpBox> box = seen.computeIfAbsent(java.util.HexFormat.of().formatHex(e.boxId()),
                    k -> boxes.find(e.boxId()));
            if (box.isPresent() && fits(box.get(), e.heightMm())) {
                String label = box.get().bag() ? box.get().getName()
                        : BoxOptions.option(box.get(), e.heightMm()).label();
                out.put(e.goodsSig(), new Hint(label, remembered(e.uses())));
            }
        }
        return out;
    }
}
