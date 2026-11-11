package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.delivery.app.ShipmentCommands.BatchResult;
import com.maxsolch.shop.delivery.app.ShipmentCommands.Labels;
import com.maxsolch.shop.delivery.app.ShipmentCommands.Options;
import com.maxsolch.shop.delivery.app.ShipmentCommands.Preview;
import com.maxsolch.shop.delivery.domain.DeliveryError;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.order.app.OrderShipmentView.ShipmentBrief;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * The waybill actions as the admin calls them: each one goes to the admin audit and answers with the waybill as the
 * order screen shows it. The work is in {@link ShipmentCreation}, {@link ShipmentEditing},
 * {@link ShipmentCancellation}, {@link ShipmentBatch}, {@link ShipmentLabels} and {@link ShipmentTrackingService}.
 */
@Service
public class ShipmentAdmin {

    private final ShipmentCreation creation;
    private final ShipmentEditing editing;
    private final ShipmentCancellation cancellation;
    private final ShipmentBatch batch;
    private final ShipmentLabels labels;
    private final ShipmentTrackingService tracking;
    private final ShipmentOrders orders;
    private final AdminAuditService audit;

    ShipmentAdmin(ShipmentCreation creation, ShipmentEditing editing, ShipmentCancellation cancellation,
                  ShipmentBatch batch, ShipmentLabels labels, ShipmentTrackingService tracking,
                  ShipmentOrders orders, AdminAuditService audit) {
        this.creation = creation;
        this.editing = editing;
        this.cancellation = cancellation;
        this.batch = batch;
        this.labels = labels;
        this.tracking = tracking;
        this.orders = orders;
        this.audit = audit;
    }

    public ShipmentBrief refresh(String orderId) {
        byte[] id = UuidUtil.toBytes(orderId);
        return tracking.refresh(id).map(s -> brief(s, id))
                .orElseThrow(() -> new DomainException.NotFound(DeliveryError.NP_NO_SHIPMENT));
    }

    public Preview preview(String orderId, Options options) {
        return creation.preview(UuidUtil.toBytes(orderId), options);
    }

    public ShipmentBrief create(String orderId, Options options) {
        byte[] id = UuidUtil.toBytes(orderId);
        OrderShipment s = creation.create(id, options);
        audit.record("NP_TTN_CREATE", "ORDER", orderId, "ТТН " + s.getTtn());
        return brief(s, id);
    }

    public ShipmentBrief update(String orderId, Options options) {
        byte[] id = UuidUtil.toBytes(orderId);
        OrderShipment s = editing.update(id, options);
        audit.record("NP_TTN_UPDATE", "ORDER", orderId, "ТТН " + s.getTtn() + " изменена");
        return brief(s, id);
    }

    public void cancel(String orderId) {
        cancellation.cancel(UuidUtil.toBytes(orderId));
        audit.record("NP_TTN_CANCEL", "ORDER", orderId, "ТТН отменена");
    }

    /** «Створити ТТН для всіх»: up to {@link ShipmentLabels#MAX_LABELS} orders at once. */
    public List<BatchResult> createAll(List<String> orderIds, String senderWarehouseRef) {
        List<String> ids = orderIds == null ? List.of() : orderIds;
        if (ids.isEmpty()) {
            throw NpErrors.bad("Не выбраны заказы");
        }
        if (ids.size() > ShipmentLabels.MAX_LABELS) {
            throw NpErrors.bad("За раз — до " + ShipmentLabels.MAX_LABELS + " заказов");
        }
        List<BatchResult> out = batch.createAll(ids, senderWarehouseRef);
        long ok = out.stream().filter(BatchResult::ok).count();
        audit.record("NP_TTN_BATCH", "ORDER", null, "ТТН созданы: " + ok + " из " + out.size());
        return out;
    }

    public Labels labels(List<String> orderIds, String format) {
        if (orderIds.isEmpty()) {
            throw NpErrors.bad("Не выбраны заказы");
        }
        return labels.labels(orderIds, format);
    }

    private ShipmentBrief brief(OrderShipment s, byte[] orderId) {
        return ShipmentFacts.brief(s, orders.find(orderId).orElse(null));
    }
}
