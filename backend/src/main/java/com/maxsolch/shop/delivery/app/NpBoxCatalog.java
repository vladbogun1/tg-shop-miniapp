package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.BoxOptions;
import com.maxsolch.shop.delivery.domain.NpBox;
import com.maxsolch.shop.delivery.domain.Parcel;
import com.maxsolch.shop.delivery.domain.ParcelPacking.BoxPreset;
import com.maxsolch.shop.delivery.domain.ParcelPacking.Unit;
import com.maxsolch.shop.delivery.infra.NpBoxRepository;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * The boxes the parcel is packed into ({@code np_boxes}, V99): the ones marked «есть у нас», or — while none is
 * marked — the whole catalog. Replaces the text setting {@code novaposhta.boxPresets}, which stays only for a
 * rollback to the backend before V99.
 */
@Component
public class NpBoxCatalog {

    private final NpBoxRepository boxes;

    NpBoxCatalog(NpBoxRepository boxes) {
        this.boxes = boxes;
    }

    /** In stock, else every box. */
    List<NpBox> usable() {
        List<NpBox> stock = boxes.findByInStockTrueOrderBySortOrderAscNameAsc();
        return stock.isEmpty() ? boxes.findAllByOrderBySortOrderAscNameAsc() : stock;
    }

    /** Presets for packing these units: every fold height, bags as thick as the units. */
    public List<BoxPreset> presets(List<Unit> units) {
        return BoxOptions.presets(usable(), units);
    }

    /** Presets without goods (the waybill dialog's list): boxes at every fold height; bags are left out. */
    public List<BoxPreset> presets() {
        return BoxOptions.presets(usable(), null);
    }

    /** A one-seat parcel packed into a bag, cut down to the goods wrapped in it (see {@link BoxOptions#wrapBag}). */
    public Parcel wrapBag(Parcel packed, List<Unit> units) {
        return BoxOptions.wrapBag(packed, usable(), units);
    }

    Optional<NpBox> find(byte[] id) {
        return id == null ? Optional.empty() : boxes.findById(id);
    }

    /** {@link #find}, only if the packers have it now: marked «есть у нас», or none is marked (as {@link #usable}). */
    Optional<NpBox> findUsable(byte[] id) {
        return find(id).filter(b -> b.isInStock() || !boxes.existsByInStockTrue());
    }

    /** Our own box, in stock, after the catalog rows; no price or tare known yet (the owner fills them in). */
    NpBox saveOwn(String name, int lengthMm, int widthMm, int heightMm, boolean bag) {
        NpBox b = new NpBox();
        b.setName(name);
        b.setKind(bag ? NpBox.KIND_BAG : NpBox.KIND_BOX);
        b.setLengthMm(lengthMm);
        b.setWidthMm(widthMm);
        b.setHeightsMm(bag ? null : String.valueOf(heightMm));
        b.setInStock(true);
        b.setSortOrder(nextSortOrder());
        return boxes.save(b);
    }

    int nextSortOrder() {
        return boxes.findAllByOrderBySortOrderAscNameAsc().stream().mapToInt(NpBox::getSortOrder).max().orElse(0) + 10;
    }
}
