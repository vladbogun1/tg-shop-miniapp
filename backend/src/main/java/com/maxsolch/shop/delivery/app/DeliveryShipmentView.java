package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStaleness;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.OrderShipmentView;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

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

    @Override
    @Transactional(readOnly = true)
    public Map<String, OrderShipmentView.Packing> toPack(Collection<byte[]> orderIds) {
        if (orderIds == null || orderIds.isEmpty()) {
            return Map.of();
        }
        Set<String> withWaybill = shipments.findByOrderIdInAndActiveTrue(orderIds).stream()
                .map(s -> UuidUtil.toString(s.getOrderId())).collect(Collectors.toSet());
        List<byte[]> open = orderIds.stream().filter(id -> !withWaybill.contains(UuidUtil.toString(id))).toList();
        Map<String, OrderShipmentView.Packing> out = new HashMap<>();
        if (open.isEmpty()) {
            return out;
        }
        // A few approved orders wait for packing at a time: the suggestion of each, as «Створити ТТН» would make it.
        // The online part still due: shown with the reason (`waiting`) — «Упаковано» would not make the waybill.
        for (ShippingOrder o : orders.findAll(open)) {
            if (o.status() == OrderStatus.APPROVED && o.deliveryMethod() == DeliveryMethod.NOVA_POSHTA
                    && !o.archived() && ShipmentManualSync.typed(o) == null) {
                String waiting = o.onlinePaymentMissing() ? PackingCommands.unpaidReason(o.amountDueMinor()) : null;
                out.put(UuidUtil.toString(o.id()), ShipmentFacts.toPack(suggestions.forOrder(o), waiting));
            }
        }
        return out;
    }
}
