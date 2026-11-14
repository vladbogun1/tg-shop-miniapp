package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.order.app.OrderShipmentView.ShipmentBrief;
import com.maxsolch.shop.platform.util.MoneyFormat;

import java.util.List;

/** What the packer's «Подтвердить коробку» takes and gives back. */
public final class PackingCommands {

    private PackingCommands() {
    }

    /**
     * The box the parcel really went into: a box of the catalog ({@code boxId} + {@code heightMm}, a fold height;
     * null = the full height, a bag — the goods' thickness) OR typed-in sides ({@code custom}).
     *
     * @param weightG from the scales; null = the goods' weight + the box's tare
     * @param seats   ignored (kept for old clients): several seats come as {@code places}
     * @param places  two or more seats (місця) of one waybill — each its own box or typed-in sides and weight;
     *                null or one = the box above
     */
    public record ConfirmBox(String boxId, Integer heightMm, CustomBox custom, Integer weightG, Integer seats,
                             List<Place> places) {

        public ConfirmBox(String boxId, Integer heightMm, CustomBox custom, Integer weightG, Integer seats) {
            this(boxId, heightMm, custom, weightG, seats, null);
        }

        /** Several seats asked for. */
        public boolean multi() {
            return places != null && places.size() > 1;
        }

        Place single() {
            return new Place(boxId, heightMm, custom, weightG);
        }
    }

    /**
     * One seat of a several-seat parcel: a catalog box ({@code boxId} + {@code heightMm}) or typed-in sides; an own
     * bag may carry its thickness in {@code custom.heightMm}. {@code weightG} null = the goods' weight shared
     * equally between the seats + the box's tare.
     */
    public record Place(String boxId, Integer heightMm, CustomBox custom, Integer weightG) {
    }

    /**
     * Sides in mm of a box that is not in the list; {@code saveAsBox} = add it to «Коробки» (in stock) for next time.
     * {@code bag} true: an own bag — length and width only, its thickness is the goods' (heightMm may be null).
     */
    public record CustomBox(String name, Integer lengthMm, Integer widthMm, Integer heightMm, boolean saveAsBox,
                            Boolean bag) {

        public CustomBox(String name, Integer lengthMm, Integer widthMm, Integer heightMm, boolean saveAsBox) {
            this(name, lengthMm, widthMm, heightMm, saveAsBox, null);
        }

        public boolean isBag() {
            return Boolean.TRUE.equals(bag);
        }
    }

    /**
     * @param shipment         the waybill as the order screens show it (box fields in {@code shipment.packing})
     * @param ttnUpdated       the waybill at Nova Poshta was changed to this box (false: NP already has the parcel,
     *                         or the number was typed in — only recorded)
     * @param ttnNumberChanged the label was printed, so NP made a new waybill: print the new label
     */
    public record Confirmed(ShipmentBrief shipment, boolean ttnUpdated, boolean ttnCreated, boolean ttnNumberChanged) {
    }

    /**
     * «Упаковано» checked before it is pressed: {@code problems} stop the waybill (the button waits), {@code warnings}
     * only tell.
     */
    public record Check(List<String> problems, List<String> warnings) {
    }

    /** Why an approved order is not packed yet: the online part has not arrived. */
    public static String unpaidReason(long amountDueMinor) {
        return "Ждём оплату " + MoneyFormat.uah(amountDueMinor) + " — ТТН создастся при «Упаковано», когда оплата придёт";
    }
}
