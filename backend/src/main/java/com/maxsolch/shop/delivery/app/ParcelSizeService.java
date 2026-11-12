package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.catalog.app.ParcelSizes;
import com.maxsolch.shop.delivery.domain.Parcel;
import com.maxsolch.shop.delivery.domain.ParcelPacking;
import com.maxsolch.shop.delivery.domain.ParcelPacking.BoxPreset;
import com.maxsolch.shop.delivery.domain.ParcelPacking.Unit;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.settings.app.SettingsService;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Weight and boxes of an order's (or a cart's) parcel. Each unit's weight and size come from the catalog
 * ({@link ParcelSizes}: variant → product → category and its parents), else the delivery settings' defaults; the
 * packing itself is {@link ParcelPacking} (presets, 60 % fill, several seats).
 */
@Service
public class ParcelSizeService {

    /** A cart can ask for any quantity; the estimate packs at most this many units. */
    static final int MAX_CART_UNITS = 50;

    private final ParcelSizes sizes;
    private final SettingsService settings;
    private final NpBoxCatalog boxes;

    public ParcelSizeService(ParcelSizes sizes, SettingsService settings, NpBoxCatalog boxes) {
        this.sizes = sizes;
        this.settings = settings;
        this.boxes = boxes;
    }

    /** A cart line for the checkout estimate. */
    public record CartLine(String productId, String variantId, int quantity) {
    }

    /** The parcel of an order: its units still in the order (returned ones are out). */
    public Parcel forOrder(ShippingOrder order) {
        return forLines(lines(order), Integer.MAX_VALUE);
    }

    /** The units of an order, one per piece, as the packing sees them (catalog sizes, else the defaults). */
    List<Unit> units(ShippingOrder order) {
        return goods(lines(order), Integer.MAX_VALUE).units();
    }

    private static List<CartLine> lines(ShippingOrder order) {
        List<CartLine> lines = new ArrayList<>();
        for (ShippingOrder.Line l : order.lines()) {
            int qty = Math.max(0, l.quantity() - Math.max(0, l.returnedQty()));
            if (qty > 0) {
                lines.add(new CartLine(l.productId(), l.variantId(), qty));
            }
        }
        return lines;
    }

    /** The parcel of a cart (checkout «≈ ціна доставки»): same rules as for an order. */
    public Parcel forCart(List<CartLine> lines) {
        return forLines(lines == null ? List.of() : lines, MAX_CART_UNITS);
    }

    private Parcel forLines(List<CartLine> lines, int maxUnits) {
        Goods g = goods(lines, maxUnits);
        Parcel packed = ParcelPacking.pack(g.units(), defaults(), boxes.presets(g.units()), fill());
        return documents(packed, !g.units().isEmpty() && g.flat());
    }

    /** The units of these lines and whether all of them are flat goods («Документи»). */
    private record Goods(List<Unit> units, boolean flat) {
    }

    private Goods goods(List<CartLine> lines, int maxUnits) {
        List<Unit> units = new ArrayList<>();
        Set<String> flatSlugs = flatSlugs();
        boolean flat = true;
        Unit def = defaults();
        for (CartLine line : lines) {
            if (line == null || line.productId() == null || line.quantity() <= 0) {
                continue;
            }
            byte[] productId = bytes(line.productId());
            if (productId == null) {
                continue;
            }
            ParcelSizes.UnitSize size = sizes.unit(productId, bytes(line.variantId()));
            Unit u = unitOf(size, def);
            for (int i = 0; i < line.quantity() && units.size() < maxUnits; i++) {
                units.add(u);
            }
            flat &= !flatSlugs.isEmpty() && size.categorySlugs().stream().anyMatch(flatSlugs::contains);
        }
        return new Goods(units, flat);
    }

    static Unit unitOf(ParcelSizes.UnitSize size, Unit def) {
        int[] box = size.box();
        boolean sized = box != null;
        return new Unit(size.weightG() != null ? size.weightG() : def.weightG(),
                sized ? box[0] : def.l(), sized ? box[1] : def.w(), sized ? box[2] : def.h(), sized);
    }

    /**
     * «Документи»: only flat goods (coasters, sleeves — categories of the setting and their subcategories), one
     * seat, at most the setting's weight with the envelope. NP prices it by weight only, cheaper than a parcel.
     */
    Parcel documents(Parcel p, boolean allFlat) {
        if (!allFlat || !settings.getBool(DeliverySettings.NP_DOCUMENTS_ENABLED) || p.seats().size() != 1) {
            return p;
        }
        int max = Math.min(1000, positive(settings.getInt(DeliverySettings.NP_DOCUMENTS_MAX_WEIGHT_G), 1000));
        return p.weightG() <= max ? p.withDocuments(true) : p;
    }

    private Set<String> flatSlugs() {
        Set<String> out = new HashSet<>();
        String raw = settings.getString(DeliverySettings.NP_DOCUMENTS_CATEGORIES);
        if (raw != null) {
            for (String s : raw.split("[,;\\s]+")) {
                if (!s.isBlank()) {
                    out.add(s.trim().toLowerCase(Locale.ROOT));
                }
            }
        }
        return out;
    }

    Unit defaults() {
        return new Unit(
                positive(settings.getInt(DeliverySettings.NP_DEFAULT_WEIGHT_G), 1000),
                positive(settings.getInt(DeliverySettings.NP_DEFAULT_LENGTH_MM), 300),
                positive(settings.getInt(DeliverySettings.NP_DEFAULT_WIDTH_MM), 200),
                positive(settings.getInt(DeliverySettings.NP_DEFAULT_HEIGHT_MM), 100),
                false);
    }

    /**
     * The boxes of {@code np_boxes} at every fold height (bags need goods to size them, so they are not listed). The
     * text setting {@code novaposhta.boxPresets} is read only by the backend before V99.
     */
    public List<BoxPreset> presets() {
        return boxes.presets();
    }

    /** Share of a box the goods may take (the rest is filler and air), from the settings, 0.3–1. */
    double fill() {
        int pct = settings.getInt(DeliverySettings.NP_BOX_FILL_PCT);
        return (pct >= 30 && pct <= 100 ? pct : ParcelPacking.DEFAULT_FILL_PCT) / 100.0;
    }

    private static byte[] bytes(String id) {
        if (id == null || id.isBlank()) {
            return null;
        }
        try {
            return UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static int positive(int v, int fallback) {
        return v > 0 ? v : fallback;
    }
}
