package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.app.ShipmentCommands.BatchResult;
import com.maxsolch.shop.delivery.app.ShipmentCommands.Options;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * «Створити ТТН для всіх» on «К отправке», main admin only (defaults, one sender branch for all; unpaid ones and ones
 * with a waybill are skipped with their reason). Each order goes through {@link ShipmentCreation#create}, so the same
 * lock and once-only save apply. The automatic waybill on approve is gone (v3.67.0): «Упаковано» makes it.
 */
@Service
public class ShipmentBatch {

    private final ShipmentCreation creation;

    ShipmentBatch(ShipmentCreation creation) {
        this.creation = creation;
    }

    /** {@code senderWarehouseRef}: the branch the parcels go from (null = the default one). */
    public List<BatchResult> createAll(List<String> orderIds, String senderWarehouseRef) {
        Options base = Options.fromBranch(senderWarehouseRef);
        List<BatchResult> out = new ArrayList<>();
        for (String id : orderIds) {
            String shortId = id == null ? null : id.substring(0, Math.min(8, id.length()));
            try {
                OrderShipment s = creation.create(UuidUtil.toBytes(id), base);
                out.add(new BatchResult(id, shortId, true, s.getTtn(), null));
            } catch (RuntimeException e) {
                out.add(new BatchResult(id, shortId, false, null, e.getMessage()));
            }
        }
        return out;
    }
}
