package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.order.app.OrderShipmentView.ShipmentBrief;

/** What the packer's «Подтвердить коробку» takes and gives back. */
public final class PackingCommands {

    private PackingCommands() {
    }

    /**
     * The box the parcel really went into: a box of the catalog ({@code boxId} + {@code heightMm}, a fold height;
     * null = the full height, a bag — the goods' thickness) OR typed-in sides ({@code custom}).
     *
     * @param weightG from the scales; null = the goods' weight + the box's tare
     * @param seats   reserved for several seats: null or 1 for now
     */
    public record ConfirmBox(String boxId, Integer heightMm, CustomBox custom, Integer weightG, Integer seats) {
    }

    /**
     * Sides in mm of a box that is not in the list; {@code saveAsBox} = add it to «Коробки» (in stock) for next time.
     */
    public record CustomBox(String name, Integer lengthMm, Integer widthMm, Integer heightMm, boolean saveAsBox) {
    }

    /**
     * @param shipment         the waybill as the order screens show it (box fields in {@code shipment.packing})
     * @param ttnUpdated       the waybill at Nova Poshta was changed to this box (false: NP already has the parcel,
     *                         or the number was typed in — only recorded)
     * @param ttnNumberChanged the label was printed, so NP made a new waybill: print the new label
     */
    public record Confirmed(ShipmentBrief shipment, boolean ttnUpdated, boolean ttnCreated, boolean ttnNumberChanged) {
    }
}
