package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.Parcel;
import com.maxsolch.shop.delivery.domain.ParcelPacking;
import com.maxsolch.shop.order.app.OrderShipmentView.ShipmentBrief;

import java.time.LocalDate;
import java.util.List;

/** What the waybill actions take and give back (the JSON of the branch's {@code ShipmentService} records). */
public final class ShipmentCommands {

    private ShipmentCommands() {
    }

    /**
     * What the admin may change before «Створити ТТН»; every field null = take it from the order, the products and
     * the settings.
     *
     * @param collectCod  false = do not collect the rest of the money (it was paid another way)
     * @param allowUnpaid the admin confirmed sending although the online payment has not arrived
     * @param documents   null = «Документи» when the goods qualify; false = always a parcel; true = documents
     */
    public record Options(String senderWarehouseRef, Integer weightG, Integer lengthMm, Integer widthMm,
                          Integer heightMm, Long declaredMinor, Boolean collectCod, String description,
                          LocalDate date, String recipientLastName, String recipientFirstName,
                          String recipientMiddleName, boolean allowUnpaid, Boolean documents) {

        public static Options defaults() {
            return new Options(null, null, null, null, null, null, null, null, null, null, null, null, false, null);
        }

        /** Defaults sent from one branch of the sender (null/blank = the default branch). */
        public static Options fromBranch(String senderWarehouseRef) {
            return senderWarehouseRef == null || senderWarehouseRef.isBlank() ? defaults()
                    : new Options(senderWarehouseRef.trim(), null, null, null, null, null, null, null, null, null,
                    null, null, false, null);
        }

        Options allowingUnpaid() {
            return new Options(senderWarehouseRef, weightG, lengthMm, widthMm, heightMm, declaredMinor, collectCod,
                    description, date, recipientLastName, recipientFirstName, recipientMiddleName, true, documents);
        }
    }

    /**
     * The «Створити ТТН» dialog.
     *
     * @param problems blocking: the waybill cannot be made until they are fixed
     * @param warnings NP may refuse or charge more (Latin letters in the name, a heavy parcel locker…)
     * @param unpaid   the online payment has not arrived — creating needs {@code allowUnpaid}
     */
    public record Preview(String orderId, String shortId, String orderStatus, String serviceType,
                          String recipientLastName, String recipientFirstName, String recipientMiddleName,
                          String recipientPhone, String cityName, String destination,
                          String senderWarehouseRef, List<NovaPoshtaSenderService.SenderWarehouse> senderWarehouses,
                          Parcel parcel, List<ParcelPacking.BoxPreset> presets,
                          long declaredMinor, long codMinor, boolean collectCod, String description, LocalDate date,
                          Long estimateMinor, Long codFeeMinor, String payer,
                          List<String> problems, List<String> warnings, boolean unpaid, long amountDueMinor,
                          boolean dryRun, ShipmentBrief existing) {
    }

    /** One row of «Створити ТТН для всіх». */
    public record BatchResult(String orderId, String shortId, boolean ok, String ttn, String error) {
    }

    /** A label PDF, how many waybills it holds and the numbers left out (typed-in, not ours or stale). */
    public record Labels(byte[] pdf, int count, boolean dryRun, List<String> skipped) {
    }
}
