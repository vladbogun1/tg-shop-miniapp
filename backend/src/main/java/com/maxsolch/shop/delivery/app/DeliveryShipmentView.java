package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStaleness;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.OrderShipmentView;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The waybills of orders for the order screens and rules ({@link OrderShipmentView}): the newest active one per order;
 * the staleness check reads the order only for our waybills NP has no parcel for yet.
 */
@Component
public class DeliveryShipmentView implements OrderShipmentView {

    private final OrderShipmentRepository shipments;
    private final ShipmentOrders orders;
    private final BoxSuggestion suggestions;

    public DeliveryShipmentView(OrderShipmentRepository shipments, ShipmentOrders orders, BoxSuggestion suggestions) {
        this.shipments = shipments;
        this.orders = orders;
        this.suggestions = suggestions;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, ShipmentBrief> forOrders(Collection<byte[]> orderIds) {
        if (orderIds == null || orderIds.isEmpty()) {
            return Map.of();
        }
        Map<String, OrderShipment> newest = new HashMap<>();
        for (OrderShipment s : shipments.findByOrderIdInAndActiveTrue(orderIds)) {
            newest.merge(UuidUtil.toString(s.getOrderId()), s, (a, b) -> b.getCreatedAt() != null
                    && (a.getCreatedAt() == null || b.getCreatedAt().isAfter(a.getCreatedAt())) ? b : a);
        }
        List<byte[]> checked = newest.values().stream().filter(ShipmentStaleness::applies)
                .map(OrderShipment::getOrderId).toList();
        Map<String, ShippingOrder> byId = new HashMap<>();
        if (!checked.isEmpty()) {
            orders.findAll(checked).forEach(o -> byId.put(UuidUtil.toString(o.id()), o));
        }
        // What the packing memory says now for the goods still to be packed: one query for the page.
        Map<String, BoxSuggestion.Hint> hints = suggestions.rememberedLabels(newest.values().stream()
                .filter(ShipmentFacts::unconfirmed).map(OrderShipment::getGoodsKey).filter(k -> k != null)
                .distinct().toList());
        Map<String, ShipmentBrief> out = new HashMap<>();
        newest.forEach((id, s) -> out.put(id, ShipmentFacts.brief(s, byId.get(id),
                s.getGoodsKey() == null ? null : hints.get(s.getGoodsKey()))));
        return out;
    }
}
