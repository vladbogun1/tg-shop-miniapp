package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.domain.ProductImage;
import com.maxsolch.shop.domain.SenderType;
import com.maxsolch.shop.repository.OrderItemRepository;
import com.maxsolch.shop.repository.OrderMessageRepository;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.payment.MonobankClient;
import com.maxsolch.shop.payment.PaymentInvoice;
import com.maxsolch.shop.payment.PaymentInvoiceRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.repository.ProductImageRepository;
import com.maxsolch.shop.translation.ContentLocale;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.web.dto.DispatchOrderDto;
import com.maxsolch.shop.web.dto.OrderCardDto;
import com.maxsolch.shop.web.dto.OrderDetailDto;
import com.maxsolch.shop.web.dto.OrderItemDto;
import com.maxsolch.shop.web.dto.OrderSummaryDto;
import com.maxsolch.shop.web.dto.OnlinePaymentDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Read-side mapping for orders (summaries / detail / board cards).
 *
 * <p>List endpoints take a {@link CardContext}: the unread counts, item counts and thumbnails for
 * the whole page, fetched in three grouped queries up front. Building them per card is what made
 * the admin board issue thousands of queries per refresh.
 */
@Service
public class OrderQueryService {

    private final OrderRepository orderRepository;
    private final OrderMessageRepository messageRepository;
    private final OrderItemRepository orderItemRepository;
    private final PaymentInvoiceRepository invoiceRepository;
    private final MonobankClient monobank;
    private final ProductImageRepository productImageRepository;
    private final TranslationService translationService;
    private final UserRepository userRepository;

    public OrderQueryService(OrderRepository orderRepository,
                             OrderMessageRepository messageRepository,
                             OrderItemRepository orderItemRepository,
                             PaymentInvoiceRepository invoiceRepository,
                             MonobankClient monobank,
                             ProductImageRepository productImageRepository,
                             TranslationService translationService,
                             UserRepository userRepository) {
        this.orderRepository = orderRepository;
        this.messageRepository = messageRepository;
        this.orderItemRepository = orderItemRepository;
        this.invoiceRepository = invoiceRepository;
        this.monobank = monobank;
        this.productImageRepository = productImageRepository;
        this.translationService = translationService;
        this.userRepository = userRepository;
    }

    /**
     * Pre-fetched per-order numbers for a page of cards.
     *
     * @param unread     order id (UUID string) → unread messages from the other side
     * @param itemCounts order id (UUID string) → total units in the order
     */
    public record CardContext(Map<String, Long> unread, Map<String, Integer> itemCounts) {

        static CardContext empty() {
            return new CardContext(Map.of(), Map.of());
        }

        long unreadFor(String orderId) {
            return unread.getOrDefault(orderId, 0L);
        }

        int itemsFor(String orderId) {
            return itemCounts.getOrDefault(orderId, 0);
        }
    }

    /**
     * Builds the context for a page of orders: two grouped queries regardless of page size.
     *
     * @param unreadFrom whose unread messages to count — CUSTOMER for the admin views, ADMIN for
     *                   the customer's own order list
     */
    @Transactional(readOnly = true)
    public CardContext cardContext(List<Order> orders, SenderType unreadFrom) {
        if (orders.isEmpty()) {
            return CardContext.empty();
        }
        List<byte[]> ids = orders.stream().map(Order::getId).toList();

        Map<String, Long> unread = new HashMap<>();
        for (Object[] row : messageRepository.unreadCountsBySender(unreadFrom)) {
            unread.put(UuidUtil.toString((byte[]) row[0]), ((Number) row[1]).longValue());
        }

        Map<String, Integer> itemCounts = new HashMap<>();
        for (Object[] row : orderItemRepository.itemCountsByOrder(ids)) {
            itemCounts.put(UuidUtil.toString((byte[]) row[0]), ((Number) row[1]).intValue());
        }
        return new CardContext(unread, itemCounts);
    }

    @Transactional(readOnly = true)
    public OrderSummaryDto toSummary(Order o, CardContext ctx) {
        String id = UuidUtil.toString(o.getId());
        return new OrderSummaryDto(
                id,
                o.getStatus().name(),
                o.getTotalMinor(),
                o.getCurrency(),
                o.getCreatedAt(),
                ctx.itemsFor(id),
                ctx.unreadFor(id),
                o.isPaid(),
                receivedMinor(o),
                o.getPaymentDueAt(),
                OrderService.amountDueMinor(o),
                o.getCancelRequestStatus());
    }

    @Transactional(readOnly = true)
    public OrderCardDto toCard(Order o, CardContext ctx) {
        String id = UuidUtil.toString(o.getId());
        return new OrderCardDto(
                id,
                o.getCustomerName(),
                o.getTotalMinor(),
                o.getCurrency(),
                ctx.itemsFor(id),
                o.getDeliveryMethod() == null ? null : o.getDeliveryMethod().name(),
                o.getPaymentOptionTitle(),
                ctx.unreadFor(id),
                o.getCreatedAt(),
                o.getStatus().name(),
                o.isPaid(),
                receivedMinor(o),
                o.getPaymentDueAt(),
                OrderService.amountDueMinor(o),
                sourceOf(o),
                o.getCancelRequestStatus());
    }

    private static String sourceOf(Order o) {
        return o.getSource() == null ? "MINIAPP" : o.getSource().name();
    }

    /** Maps a whole page of orders, fetching the shared context once. */
    @Transactional(readOnly = true)
    public List<OrderCardDto> toCards(List<Order> orders, SenderType unreadFrom) {
        CardContext ctx = cardContext(orders, unreadFrom);
        return orders.stream().map(o -> toCard(o, ctx)).toList();
    }

    /** Same for the customer's order list. */
    @Transactional(readOnly = true)
    public List<OrderSummaryDto> toSummaries(List<Order> orders) {
        CardContext ctx = cardContext(orders, SenderType.ADMIN);
        return orders.stream().map(o -> toSummary(o, ctx)).toList();
    }

    /** Admin view: line titles are the Russian snapshots. */
    @Transactional(readOnly = true)
    public OrderDetailDto toDetail(Order o) {
        return toDetail(o, ContentLocale.RU);
    }

    /**
     * Customer view: a line shows the product's current translation for {@code lang} when there is
     * one, else the snapshot. {@code order_items.title_snapshot} itself stays Russian — the seller,
     * the dispatch list and the channel read it.
     */
    @Transactional(readOnly = true)
    public OrderDetailDto toDetail(Order o, String lang) {
        List<OrderItem> orderItems = o.getItems();
        Map<String, String> thumbnails = thumbnailsFor(orderItems);
        TranslationService.ItemNames names = ContentLocale.isTranslated(lang)
                ? translationService.orderItemNames(
                        orderItems.stream().map(OrderItem::getProductId).filter(java.util.Objects::nonNull).toList(),
                        orderItems.stream().map(OrderItem::getVariantId).filter(java.util.Objects::nonNull).toList(),
                        lang)
                : TranslationService.ItemNames.EMPTY;
        List<OrderItemDto> items = orderItems.stream()
                .map(it -> toItemDto(it, thumbnails, names))
                .toList();
        OnlinePaymentDto payment = onlinePayment(o);
        // The language the customer chose in the shop (users.locale): the admin answers in it.
        Long customerId = o.getUserId() != null ? o.getUserId() : o.getTgUserId();
        String customerLocale = customerId == null ? null : userRepository.localeOf(customerId).orElse(null);
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
                payment,
                o.getTgUserId(),
                o.getTgUsername(),
                o.getCreatedAt(),
                o.getApprovedAt(),
                o.getShippedAt(),
                o.getDeliveredAt(),
                o.getRejectedAt(),
                o.isPaid(),
                o.getPaidAt(),
                o.getPrepaymentMinor(),
                receivedMinor(o),
                o.getPaymentDueAt(),
                OrderService.amountDueMinor(o),
                sourceOf(o),
                customerLocale,
                o.getRejectReasonCode(),
                Math.max(0, o.getRefundedMinor()),
                o.getReturnedAt(),
                o.getNpCityRef(),
                o.getNpWarehouseRef(),
                o.getCancelRequestStatus(),
                o.getCancelRequestReason(),
                o.getCancelRequestedAt(),
                o.getCancelRequestResolvedAt(),
                o.getCancelRequestAdminComment());
    }

    /** Exact amount actually received for the order (online payments + the admin "mark paid" dialog). */
    public static long receivedMinor(Order o) {
        return Math.min(Math.max(0, o.getReceivedMinor()), o.getTotalMinor());
    }

    /** Cash-on-delivery (наложка) to collect at Nova Poshta. */
    public static long codMinor(Order o) {
        return Math.max(0, o.getTotalMinor() - receivedMinor(o));
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
        List<DispatchOrderDto> rows = new ArrayList<>(
                orderRepository.findByStatusOrderByCreatedAtDesc(OrderStatus.APPROVED).stream()
                        .map(this::toDispatch)
                        .toList());
        if (includeNew) {
            orderRepository.findByStatusOrderByCreatedAtDesc(OrderStatus.NEW).stream()
                    .map(this::toDispatch)
                    .forEach(rows::add);
        }
        return rows;
    }

    @Transactional(readOnly = true)
    public DispatchOrderDto toDispatch(Order o) {
        long received = receivedMinor(o);
        long cod = codMinor(o);
        List<DispatchOrderDto.DispatchItem> items = o.getItems().stream()
                .map(it -> new DispatchOrderDto.DispatchItem(
                        it.getTitleSnapshot(), it.getVariantNameSnapshot(),
                        it.getQuantity(), it.getPriceMinorSnapshot()))
                .toList();
        String shortId = UuidUtil.toString(o.getId());
        if (shortId != null && shortId.length() >= 8) {
            shortId = shortId.substring(0, 8);
        }
        return new DispatchOrderDto(
                UuidUtil.toString(o.getId()),
                shortId,
                o.getCustomerName(),
                o.getPhone(),
                o.getDeliveryMethod() == null ? null : o.getDeliveryMethod().name(),
                o.getNpCityName(),
                o.getNpWarehouseName(),
                items,
                o.getTotalMinor(),
                o.getPrepaymentMinor(),
                received,
                cod,
                o.isPaid(),
                o.getCurrency(),
                o.getPaymentOptionTitle(),
                o.getTrackingNumber(),
                o.getCreatedAt(),
                o.getApprovedAt(),
                o.getStatus().name(),
                o.getPaymentDueAt(),
                OrderService.amountDueMinor(o));
    }

    /** One query for all the line thumbnails instead of one per line. */
    private Map<String, String> thumbnailsFor(List<OrderItem> items) {
        List<byte[]> productIds = new ArrayList<>();
        for (OrderItem it : items) {
            if (it.getProductId() != null) {
                productIds.add(it.getProductId());
            }
        }
        if (productIds.isEmpty()) {
            return Map.of();
        }
        Map<String, String> first = new HashMap<>();
        for (ProductImage image : productImageRepository.findForProducts(productIds)) {
            // Results are ordered by sortOrder, so the first one seen per product wins.
            first.putIfAbsent(UuidUtil.toString(image.getProduct().getId()), image.getUrl());
        }
        return first;
    }

    private OrderItemDto toItemDto(OrderItem it, Map<String, String> thumbnails,
                                   TranslationService.ItemNames names) {
        String productId = it.getProductId() == null ? null : UuidUtil.toString(it.getProductId());
        String variantId = it.getVariantId() == null ? null : UuidUtil.toString(it.getVariantId());
        return new OrderItemDto(
                it.getId(),
                productId,
                names.title(productId, it.getTitleSnapshot()),
                it.getPriceMinorSnapshot(),
                variantId,
                names.variant(variantId, it.getVariantNameSnapshot()),
                it.getQuantity(),
                productId == null ? null : thumbnails.get(productId),
                it.isGift(),
                it.getReturnedQty());
    }

    /** Latest monobank invoice of the order, as the customer apps need it. */
    public OnlinePaymentDto onlinePayment(Order o) {
        List<PaymentInvoice> list = invoiceRepository.findByOrderIdOrderByCreatedAtDesc(o.getId());
        if (list.isEmpty()) {
            return new OnlinePaymentDto(monobank.isEnabled(), "none", null, null, 0, null, null, null);
        }
        // A paid invoice wins over a newer abandoned one (the card/method is what the customer wants to see).
        PaymentInvoice inv = list.stream().filter(i -> i.getAppliedAt() != null).findFirst().orElse(list.get(0));
        boolean live = inv.isPayable(java.time.Instant.now());
        return new OnlinePaymentDto(monobank.isEnabled(), inv.getStatus(), live ? inv.getPageUrl() : null,
                inv.getExpiresAt(), inv.getAmountMinor(), inv.getMaskedPan(), inv.getPaymentMethod(),
                inv.getFailureReason());
    }

    // expose for board grouping convenience
    public List<Order> byStatus(OrderStatus status) {
        return orderRepository.findByStatusOrderByCreatedAtDesc(status);
    }
}
