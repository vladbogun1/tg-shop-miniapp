package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderPaymentState;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Dispatch rows of the admin: orders waiting to be packed and shipped, with the photo of every line. */
@Service
public class OrderDispatchView {

    private final OrderRepository orderRepository;
    private final OrderThumbnails thumbnails;

    public OrderDispatchView(OrderRepository orderRepository, OrderThumbnails thumbnails) {
        this.orderRepository = orderRepository;
        this.thumbnails = thumbnails;
    }

    /** All APPROVED orders mapped to dispatch rows (newest first). */
    @Transactional(readOnly = true)
    public List<DispatchOrderDto> dispatchList() {
        return dispatchList(false);
    }

    /**
     * APPROVED orders, plus — when {@code includeNew} — the NEW ones after them: NEW → SHIPPED is a
     * legal transition, and on a shipping day the seller often sends an order without approving it
     * first. The client marks NEW rows that still wait for a prepayment.
     */
    @Transactional(readOnly = true)
    public List<DispatchOrderDto> dispatchList(boolean includeNew) {
        List<Order> orders = new ArrayList<>(orderRepository.findByStatusOrderByCreatedAtDesc(OrderStatus.APPROVED));
        if (includeNew) {
            orders.addAll(orderRepository.findByStatusOrderByCreatedAtDesc(OrderStatus.NEW));
        }
        // One query for the photos of every line on the page: packing goes by the picture, not the text.
        Map<String, String> photos = thumbnails.of(orders.stream().flatMap(o -> o.getItems().stream()).toList());
        return orders.stream().map(o -> toDispatch(o, photos)).toList();
    }

    @Transactional(readOnly = true)
    public DispatchOrderDto toDispatch(Order o) {
        return toDispatch(o, thumbnails.of(o.getItems()));
    }

    private DispatchOrderDto toDispatch(Order o, Map<String, String> photos) {
        OrderPaymentState pay = OrderPaymentState.of(o);
        List<DispatchOrderDto.DispatchItem> items = o.getItems().stream()
                .map(it -> new DispatchOrderDto.DispatchItem(
                        it.getTitleSnapshot(), it.getVariantNameSnapshot(),
                        it.getQuantity(), it.getPriceMinorSnapshot(),
                        it.getProductId() == null ? null : photos.get(UuidUtil.toString(it.getProductId()))))
                .toList();
        String shortId = UuidUtil.toString(o.getId());
        if (shortId != null && shortId.length() >= 8) {
            shortId = shortId.substring(0, 8);
        }
        return DispatchOrderDto.builder()
                .id(UuidUtil.toString(o.getId()))
                .shortId(shortId)
                .customerName(o.getCustomerName())
                .phone(o.getPhone())
                .deliveryMethod(o.getDeliveryMethod() == null ? null : o.getDeliveryMethod().name())
                .npCityName(o.getNpCityName())
                .npWarehouseName(o.getNpWarehouseName())
                .items(items)
                .totalMinor(o.getTotalMinor())
                .prepaymentMinor(o.getPrepaymentMinor())
                .receivedMinor(pay.receivedMinor())
                .codMinor(OrderMoney.codMinor(o))
                .paid(pay.paid())
                .currency(o.getCurrency())
                .paymentOptionTitle(o.getPaymentOptionTitle())
                .trackingNumber(o.getTrackingNumber())
                .createdAt(o.getCreatedAt())
                .approvedAt(o.getApprovedAt())
                .status(o.getStatus().name())
                .paymentDueAt(pay.paymentDueAt())
                .amountDueMinor(pay.amountDueMinor())
                .build();
    }
}
