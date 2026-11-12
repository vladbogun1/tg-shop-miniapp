package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.app.ShipmentCommands.BatchResult;
import com.maxsolch.shop.delivery.app.ShipmentCommands.Options;
import com.maxsolch.shop.delivery.domain.NovaPoshtaGateway;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.settings.app.SettingsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Waybills without the dialog: «Створити ТТН для всіх» on «К отправке» (defaults, one sender branch for all; unpaid
 * ones and ones with a waybill are skipped with their reason) and the automatic one on approve (setting
 * {@code novaposhta.autoCreateTtn}, off in code, on in prod). Each order goes through {@link ShipmentCreation#create},
 * so the same lock and once-only save apply.
 */
@Slf4j
@Service
public class ShipmentBatch {

    private final ShipmentCreation creation;
    private final OrderShipmentRepository shipments;
    private final NovaPoshtaGateway api;
    private final SettingsService settings;
    private final NpAlerts alerts;

    ShipmentBatch(ShipmentCreation creation, OrderShipmentRepository shipments, NovaPoshtaGateway api,
                  SettingsService settings, NpAlerts alerts) {
        this.creation = creation;
        this.shipments = shipments;
        this.api = api;
        this.settings = settings;
        this.alerts = alerts;
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

    /**
     * Auto-create on approve; the approve itself never fails for it. A failure is raised on «Внимание» (the admin
     * makes the waybill with «Создать ТТН»); each failure is a new alert, so it shows even after «Разобрано».
     */
    public void autoCreate(byte[] orderId) {
        if (!settings.getBool(DeliverySettings.NP_AUTO_CREATE_TTN) || !api.keyConfigured()) {
            return;
        }
        if (shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(orderId).isPresent()) {
            return;
        }
        try {
            OrderShipment s = creation.create(orderId, Options.defaults());
            log.info("NP waybill {} created automatically on approve", s.getTtn());
        } catch (RuntimeException e) {
            String id = UuidUtil.toString(orderId);
            log.warn("NP auto waybill for order {} not created: {}", id, e.getMessage());
            alerts.clear(NpAlerts.Kind.AUTO_TTN); // a fresh «since»: a new failure shows again after «Разобрано»
            alerts.raise(NpAlerts.Kind.AUTO_TTN, "Заказ #" + id.substring(0, 8) + " одобрен, но ТТН не создалась "
                    + "автоматически (" + e.getMessage() + "). Создайте её вручную на «К отправке».");
        }
    }
}
