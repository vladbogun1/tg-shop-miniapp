package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.domain.PaymentRequisites;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.repository.PaymentRequisitesRepository;
import com.maxsolch.shop.repository.ProductImageRepository;
import com.maxsolch.shop.web.dto.OrderCardDto;
import com.maxsolch.shop.web.dto.OrderDetailDto;
import com.maxsolch.shop.web.dto.OrderItemDto;
import com.maxsolch.shop.web.dto.OrderSummaryDto;
import com.maxsolch.shop.web.dto.PaymentRequisitesDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Read-side mapping for orders (summaries / detail / board cards). Keeps OrderService focused
 * on the write-side lifecycle.
 */
@Service
public class OrderQueryService {

    private final OrderRepository orderRepository;
    private final OrderMessageReadModel readModel;
    private final PaymentRequisitesRepository requisitesRepository;
    private final ProductImageRepository productImageRepository;

    public OrderQueryService(OrderRepository orderRepository,
                             MessageService messageService,
                             PaymentRequisitesRepository requisitesRepository,
                             ProductImageRepository productImageRepository) {
        this.orderRepository = orderRepository;
        this.readModel = messageService::unreadForCustomer;
        this.requisitesRepository = requisitesRepository;
        this.productImageRepository = productImageRepository;
    }

    @FunctionalInterface
    private interface OrderMessageReadModel {
        long unread(byte[] orderId);
    }

    @Transactional(readOnly = true)
    public OrderSummaryDto toSummary(Order o) {
        return new OrderSummaryDto(
                UuidUtil.toString(o.getId()),
                o.getStatus().name(),
                o.getTotalMinor(),
                o.getCurrency(),
                o.getCreatedAt(),
                itemsCount(o),
                readModel.unread(o.getId()));
    }

    @Transactional(readOnly = true)
    public OrderCardDto toCard(Order o, long unread) {
        return new OrderCardDto(
                UuidUtil.toString(o.getId()),
                o.getCustomerName(),
                o.getTotalMinor(),
                o.getCurrency(),
                itemsCount(o),
                o.getDeliveryMethod() == null ? null : o.getDeliveryMethod().name(),
                o.getPaymentOptionTitle(),
                unread,
                o.getCreatedAt(),
                o.getStatus().name());
    }

    @Transactional(readOnly = true)
    public OrderDetailDto toDetail(Order o) {
        List<OrderItemDto> items = o.getItems().stream()
                .map(this::toItemDto)
                .toList();
        PaymentRequisitesDto requisites = requisitesRepository.findById(1)
                .map(this::toRequisitesDto)
                .orElse(null);
        return new OrderDetailDto(
                UuidUtil.toString(o.getId()),
                o.getStatus().name(),
                o.getSubtotalMinor(),
                o.getDiscountMinor(),
                o.getTotalMinor(),
                o.getCurrency(),
                o.getCustomerName(),
                o.getPhone(),
                o.getComment(),
                o.getPromoCode(),
                o.getDeliveryMethod() == null ? null : o.getDeliveryMethod().name(),
                o.getNpCityName(),
                o.getNpWarehouseName(),
                o.getPaymentOptionTitle(),
                o.getTrackingNumber(),
                o.getRejectReason(),
                items,
                requisites,
                o.getTgUserId(),
                o.getTgUsername(),
                o.getCreatedAt(),
                o.getApprovedAt(),
                o.getShippedAt(),
                o.getDeliveredAt(),
                o.getRejectedAt());
    }

    private OrderItemDto toItemDto(OrderItem it) {
        String imageUrl = it.getProductId() == null ? null
                : productImageRepository.findFirstByProduct_IdOrderBySortOrderAscIdAsc(it.getProductId())
                        .map(pi -> pi.getUrl())
                        .orElse(null);
        return new OrderItemDto(
                UuidUtil.toString(it.getProductId()),
                it.getTitleSnapshot(),
                it.getPriceMinorSnapshot(),
                it.getVariantId() == null ? null : UuidUtil.toString(it.getVariantId()),
                it.getVariantNameSnapshot(),
                it.getQuantity(),
                imageUrl);
    }

    private PaymentRequisitesDto toRequisitesDto(PaymentRequisites r) {
        return new PaymentRequisitesDto(
                r.getCardNumber(), r.getIban(), r.getRecipient(),
                r.getEdrpou(), r.getPurpose(), r.getNote());
    }

    private int itemsCount(Order o) {
        return o.getItems().stream().mapToInt(OrderItem::getQuantity).sum();
    }

    // expose for board grouping convenience
    public List<Order> byStatus(OrderStatus status) {
        return orderRepository.findByStatusOrderByCreatedAtDesc(status);
    }
}
