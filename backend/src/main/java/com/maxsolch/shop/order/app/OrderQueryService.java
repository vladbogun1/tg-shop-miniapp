package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.GiftCaseRules;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderPaymentState;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.catalog.domain.ProductImage;
import com.maxsolch.shop.order.domain.SenderType;
import com.maxsolch.shop.platform.i18n.CustomerRejectReason;
import com.maxsolch.shop.order.infra.OrderItemRepository;
import com.maxsolch.shop.order.infra.OrderMessageRepository;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.customer.infra.UserRepository;
import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.translation.domain.ContentLocale;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.catalog.app.CatalogNames;
import com.maxsolch.shop.translation.app.TranslationService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;

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
    private final OrderOnlinePayments onlinePayments;
    private final Products productImages;
    private final TranslationService translationService;
    private final CatalogNames catalogNames;
    private final UserRepository userRepository;
    private final CustomerRejectReason customerRejectReason;
    private final OrderReturnsView returnsView;

    /** The gift block of the order page (docs/GIFT-CASE.md). */
    private final OrderGiftView gift;
    /** Money journal and write-offs shown to the admin. */
    private final com.maxsolch.shop.order.infra.OrderMoneyMovementRepository movementRepository;
    private final com.maxsolch.shop.inventory.app.StockWriteoffs writeoffRepository;

    public OrderQueryService(OrderRepository orderRepository,
                             OrderMessageRepository messageRepository,
                             OrderItemRepository orderItemRepository,
                             OrderOnlinePayments onlinePayments,
                             Products productImages,
                             TranslationService translationService,
                             CatalogNames catalogNames,
                             UserRepository userRepository,
                             CustomerRejectReason customerRejectReason,
                             OrderReturnsView returnsView,
                             com.maxsolch.shop.order.infra.OrderMoneyMovementRepository movementRepository,
                             com.maxsolch.shop.inventory.app.StockWriteoffs writeoffRepository,
                             OrderGiftView gift) {
        this.orderRepository = orderRepository;
        this.messageRepository = messageRepository;
        this.orderItemRepository = orderItemRepository;
        this.onlinePayments = onlinePayments;
        this.productImages = productImages;
        this.translationService = translationService;
        this.catalogNames = catalogNames;
        this.userRepository = userRepository;
        this.customerRejectReason = customerRejectReason;
        this.returnsView = returnsView;
        this.movementRepository = movementRepository;
        this.writeoffRepository = writeoffRepository;
        this.gift = gift;
    }

    /**
     * Pre-fetched per-order numbers for a page of cards.
     *
     * @param unread     order id (UUID string) → unread messages from the other side
     * @param itemCounts order id (UUID string) → total units in the order
     */
    public record CardContext(Map<String, Long> unread, Map<String, Integer> itemCounts,
                              Map<String, List<OrderCardDto.CardLine>> lines,
                              Map<String, List<String>> exchangeChildren) {

        static CardContext empty() {
            return new CardContext(Map.of(), Map.of(), Map.of(), Map.of());
        }

        List<String> exchangesOf(String orderId) {
            return exchangeChildren.getOrDefault(orderId, List.of());
        }

        List<OrderCardDto.CardLine> linesFor(String orderId) {
            return lines.getOrDefault(orderId, List.of());
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
        boolean admin = unreadFrom == SenderType.CUSTOMER;
        return new CardContext(unread, itemCounts, admin ? cardLines(ids) : Map.of(),
                admin ? exchangeChildren(ids) : Map.of());
    }

    /** original id → its exchange replacements (V69), one query per page. */
    private Map<String, List<String>> exchangeChildren(List<byte[]> orderIds) {
        Map<String, List<String>> out = new HashMap<>();
        for (Object[] row : orderRepository.exchangeChildren(orderIds)) {
            out.computeIfAbsent(UuidUtil.toString((byte[]) row[0]), k -> new ArrayList<>())
                    .add(UuidUtil.toString((byte[]) row[1]));
        }
        return out;
    }

    /**
     * Paid value of the units sent back and still on their way (the pending ones are the latest returned
     * units of the line). Skips the order's item list entirely when nothing is on the way.
     */
    private static long pendingReturnValueMinor(OrderItem it) {
        int pending = it.getReturnPendingQty();
        return pending <= 0 ? 0
                : OrderMoney.paidForUnitsMinor(it.getOrder(), it, it.getReturnedQty() - pending, pending);
    }

    /** The picture strip of the admin cards: every line with its first photo, two queries per page. */
    private Map<String, List<OrderCardDto.CardLine>> cardLines(List<byte[]> orderIds) {
        List<OrderItem> items = orderItemRepository.findByOrderIds(orderIds);
        Map<String, String> thumbnails = thumbnailsFor(items);
        Map<String, List<OrderCardDto.CardLine>> out = new HashMap<>();
        for (OrderItem it : items) {
            String productId = it.getProductId() == null ? null : UuidUtil.toString(it.getProductId());
            out.computeIfAbsent(UuidUtil.toString(it.getOrder().getId()), k -> new ArrayList<>())
                    .add(new OrderCardDto.CardLine(productId == null ? null : thumbnails.get(productId),
                            it.getTitleSnapshot()
                                    + (it.getVariantNameSnapshot() == null ? "" : " · " + it.getVariantNameSnapshot()),
                            it.getQuantity(), it.getReturnPendingQty(), it.getReturnedQty(), it.isGift(),
                            pendingReturnValueMinor(it)));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public OrderSummaryDto toSummary(Order o, CardContext ctx) {
        String id = UuidUtil.toString(o.getId());
        OrderPaymentState pay = OrderPaymentState.of(o);
        return OrderSummaryDto.builder()
                .id(id)
                .status(o.getStatus().name())
                .totalMinor(o.getTotalMinor())
                .currency(o.getCurrency())
                .createdAt(o.getCreatedAt())
                .itemsCount(ctx.itemsFor(id))
                .unreadCount(ctx.unreadFor(id))
                .paid(pay.paid())
                .receivedMinor(pay.receivedMinor())
                .paymentDueAt(pay.paymentDueAt())
                .amountDueMinor(pay.amountDueMinor())
                .cancelRequestStatus(o.getCancelRequestStatus())
                .giftCaseStatus(o.getGiftCaseStatus())
                .giftCaseOpenable(GiftCaseRules.giftCaseOpenable(o))
                .uncollectedMinor(pay.uncollectedMinor())
                .build();
    }

    @Transactional(readOnly = true)
    public OrderCardDto toCard(Order o, CardContext ctx) {
        String id = UuidUtil.toString(o.getId());
        OrderPaymentState pay = OrderPaymentState.of(o);
        return OrderCardDto.builder()
                .id(id)
                .customerName(o.getCustomerName())
                .totalMinor(o.getTotalMinor())
                .currency(o.getCurrency())
                .itemsCount(ctx.itemsFor(id))
                .deliveryMethod(o.getDeliveryMethod() == null ? null : o.getDeliveryMethod().name())
                .paymentOptionTitle(o.getPaymentOptionTitle())
                .unreadCount(ctx.unreadFor(id))
                .createdAt(o.getCreatedAt())
                .status(o.getStatus().name())
                .paid(pay.paid())
                .receivedMinor(pay.receivedMinor())
                .paymentDueAt(pay.paymentDueAt())
                .amountDueMinor(pay.amountDueMinor())
                .source(sourceOf(o))
                .cancelRequestStatus(o.getCancelRequestStatus())
                .archived(o.getArchivedAt() != null)
                .returnStatus(o.getReturnStatus())
                .returningUnits(ctx.linesFor(id).stream().mapToInt(OrderCardDto.CardLine::returning).sum())
                .returnedUnits(ctx.linesFor(id).stream().mapToInt(OrderCardDto.CardLine::returned).sum())
                .lines(ctx.linesFor(id))
                .exchangeOfId(o.getExchangeOfOrderId() == null ? null : UuidUtil.toString(o.getExchangeOfOrderId()))
                .exchangeOrderIds(ctx.exchangesOf(id))
                .uncollectedMinor(pay.uncollectedMinor())
                .build();
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
        return adminView(o);
    }

    /**
     * Customer view: a line shows the product's current translation for {@code lang} when there is
     * one, else the snapshot. {@code order_items.title_snapshot} itself stays Russian — the seller,
     * the dispatch list and the channel read it. The shop's own rejection reasons (cancelled by the
     * customer, payment window ran out) are worded in the request's language too.
     */
    @Transactional(readOnly = true)
    public OrderDetailDto toDetail(Order o, String lang) {
        return customerView(o, lang);
    }

    private OrderDetailDto customerView(Order o, String lang) {
        // A sealed gift case keeps its prize a surprise: the customer sees the line after opening.
        boolean sealed = GiftCaseRules.GIFT_CASE_SEALED.equals(o.getGiftCaseStatus());
        // The payment method is a Russian snapshot; the customer gets its translation while the
        // option still has the same title (content_translations, PAYMENT_OPTION/title).
        String paymentTitle = o.getPaymentOptionTitle();
        if (o.getPaymentOptionId() != null && ContentLocale.isTranslated(lang)) {
            paymentTitle = translationService.overlay(lang).text(TranslationEntityType.PAYMENT_OPTION,
                    UuidUtil.toString(o.getPaymentOptionId()), TranslationEntityType.TITLE, paymentTitle);
        }
        return detailCore(o, lang, it -> !(sealed && it.isAutoGift() && it.getCaseRarity() != null))
                .paymentOptionTitle(paymentTitle)
                .rejectReason(customerRejectReason.current(o.getRejectReason()))
                .receivedMinor(OrderPaymentState.of(o).receivedMinor())
                .exchanges(List.of())
                .gift(gift.orderGift(o, lang, true))
                .admin(null)
                .build();
    }

    private OrderDetailDto adminView(Order o) {
        return detailCore(o, ContentLocale.RU, it -> true)
                .paymentOptionTitle(o.getPaymentOptionTitle())
                .rejectReason(o.getRejectReason())
                // The admin sees what really arrived (an exchange for something cheaper leaves it
                // above the total — that overpayment is to be refunded); the customer, the capped.
                .receivedMinor(Math.max(0, o.getReceivedMinor()))
                .exchanges(returnsView.exchangesOf(o.getId()))
                .gift(gift.orderGift(o, ContentLocale.RU, false))
                .admin(adminExtras(o))
                .build();
    }

    /**
     * What the customer and the admin views share. The fields they word or fill differently
     * (payment title, reject reason, received, exchanges, gift, admin block) are left for the caller.
     */
    private OrderDetailDto.OrderDetailDtoBuilder detailCore(Order o, String lang, Predicate<OrderItem> visible) {
        List<OrderItem> orderItems = o.getItems();
        Map<String, String> thumbnails = thumbnailsFor(orderItems);
        CatalogNames.ItemNames names = ContentLocale.isTranslated(lang)
                ? catalogNames.orderItemNames(
                        orderItems.stream().map(OrderItem::getProductId).filter(java.util.Objects::nonNull).toList(),
                        orderItems.stream().map(OrderItem::getVariantId).filter(java.util.Objects::nonNull).toList(),
                        lang)
                : CatalogNames.ItemNames.EMPTY;
        List<OrderItemDto> items = orderItems.stream()
                .filter(visible)
                .map(it -> toItemDto(o, it, thumbnails, names))
                .toList();
        OnlinePaymentDto payment = onlinePayment(o);
        OrderPaymentState pay = OrderPaymentState.of(o);
        // The language the customer chose in the shop (users.locale): the admin answers in it.
        Long customerId = o.getUserId() != null ? o.getUserId() : o.getTgUserId();
        String customerLocale = customerId == null ? null : userRepository.localeOf(customerId).orElse(null);
        return OrderDetailDto.builder()
                .id(UuidUtil.toString(o.getId()))
                .status(o.getStatus().name())
                .subtotalMinor(o.getSubtotalMinor())
                .discountMinor(o.getDiscountMinor())
                .totalMinor(o.getTotalMinor())
                .currency(o.getCurrency())
                .customerName(o.getCustomerName())
                .phone(o.getPhone())
                .comment(o.getComment())
                .promoCode(o.getPromoCode())
                .deliveryMethod(o.getDeliveryMethod() == null ? null : o.getDeliveryMethod().name())
                .npCityName(o.getNpCityName())
                .npWarehouseName(o.getNpWarehouseName())
                .trackingNumber(o.getTrackingNumber())
                .items(items)
                .payment(payment)
                .tgUserId(o.getTgUserId())
                .tgUsername(o.getTgUsername())
                .createdAt(o.getCreatedAt())
                .approvedAt(o.getApprovedAt())
                .shippedAt(o.getShippedAt())
                .deliveredAt(o.getDeliveredAt())
                .rejectedAt(o.getRejectedAt())
                .paid(pay.paid())
                .paidAt(o.getPaidAt())
                .prepaymentMinor(o.getPrepaymentMinor())
                .paymentDueAt(pay.paymentDueAt())
                .amountDueMinor(pay.amountDueMinor())
                .source(sourceOf(o))
                .customerLocale(customerLocale)
                .rejectReasonCode(o.getRejectReasonCode())
                .refundedMinor(Math.max(0, o.getRefundedMinor()))
                .returnedAt(o.getReturnedAt())
                .npCityRef(o.getNpCityRef())
                .npWarehouseRef(o.getNpWarehouseRef())
                .cancelRequestStatus(o.getCancelRequestStatus())
                .cancelRequestReason(o.getCancelRequestReason())
                .cancelRequestedAt(o.getCancelRequestedAt())
                .cancelRequestResolvedAt(o.getCancelRequestResolvedAt())
                .cancelRequestAdminComment(o.getCancelRequestAdminComment())
                .giftCaseStatus(o.getGiftCaseStatus())
                .giftCaseOpenedAt(o.getGiftCaseOpenedAt())
                .giftCaseOpenable(GiftCaseRules.giftCaseOpenable(o))
                .giftDiscountMinor(o.getGiftDiscountMinor())
                .exchangeOfId(o.getExchangeOfOrderId() == null ? null : UuidUtil.toString(o.getExchangeOfOrderId()))
                .uncollectedMinor(pay.uncollectedMinor());
    }

    private OrderDetailDto.AdminExtras adminExtras(Order o) {
        List<OrderDetailDto.MovementDto> movements = movementRepository == null ? List.of()
                : movementRepository.findByOrderIdOrderByOccurredAtAscIdAsc(o.getId()).stream()
                        .map(m -> new OrderDetailDto.MovementDto(m.getId(), m.getKind(), m.getChannel(),
                                m.getAmountMinor(), m.getOccurredAt(), m.getAdminName(), m.getNote(),
                                m.getInvoiceExtId(), m.getSource()))
                        .toList();
        long retained = movements.stream().filter(m -> "RETAINED".equals(m.kind()))
                .mapToLong(OrderDetailDto.MovementDto::amountMinor).sum();
        long monoLeft = onlinePayments.refundableMinor(o.getId());
        List<OrderDetailDto.WriteoffDto> writeoffs = writeoffRepository == null ? List.of()
                : writeoffRepository.ofOrder(o.getId()).stream()
                        .map(w -> new OrderDetailDto.WriteoffDto(w.getId() == null ? 0 : w.getId(), w.getTitle(),
                                w.getQuantity(), w.getUndoneQty(), w.getUndoneNote(), w.getReason(),
                                w.getUnitValueMinor(), w.getNote(), w.getAdminName(), w.getCreatedAt()))
                        .toList();
        return OrderDetailDto.AdminExtras.builder()
                .archivedAt(o.getArchivedAt())
                .archivedBy(o.getArchivedBy())
                .archiveReason(o.getArchiveReason())
                .returnStatus(o.getReturnStatus())
                .returnReceivedAt(o.getReturnReceivedAt())
                .movements(movements)
                .retainedMinor(retained)
                .monoRefundableMinor(monoLeft)
                .writeoffs(writeoffs)
                .exchangeOfId(o.getExchangeOfOrderId() == null ? null : UuidUtil.toString(o.getExchangeOfOrderId()))
                .exchangeOrderIds(exchangeChildren(List.of(o.getId())).getOrDefault(UuidUtil.toString(o.getId()), List.of()))
                .returns(returnRecords(o))
                .mergedIntoId(o.getMergedIntoOrderId() == null ? null : UuidUtil.toString(o.getMergedIntoOrderId()))
                .mergedFromIds(orderRepository.mergedChildren(List.of(o.getId())).stream()
                        .map(r -> UuidUtil.toString((byte[]) r[1]))
                        .toList())
                .build();
    }

    /** Rows of the «Объединить» window (V71). */
    public List<OrderDetailDto.MergeCandidateDto> mergeCandidates(List<OrderMerge.Candidate> found) {
        return found.stream().map(c -> {
            Order o = c.order();
            return OrderDetailDto.MergeCandidateDto.builder()
                    .id(UuidUtil.toString(o.getId()))
                    .status(o.getStatus().name())
                    .createdAt(o.getCreatedAt())
                    .totalMinor(o.getTotalMinor())
                    .receivedMinor(Math.max(0, o.getReceivedMinor()))
                    .prepaymentMinor(o.getPrepaymentMinor())
                    .paid(o.isPaid())
                    .paymentOptionTitle(o.getPaymentOptionTitle())
                    .npCityName(o.getNpCityName())
                    .npWarehouseName(o.getNpWarehouseName())
                    .customerName(o.getCustomerName())
                    .trackingNumber(o.getTrackingNumber())
                    .giftCaseStatus(o.getGiftCaseStatus())
                    .lines(o.getItems().stream()
                            .map(i -> i.getTitleSnapshot()
                                    + (i.getVariantNameSnapshot() == null ? "" : " (" + i.getVariantNameSnapshot() + ")")
                                    + " ×" + i.getQuantity() + (i.isGift() ? " · подарок" : ""))
                            .toList())
                    .blocker(c.blocker())
                    .mergedTotalMinor(c.totalMinor())
                    .mergedReceivedMinor(c.receivedMinor())
                    .mergedAmountDueMinor(c.amountDueMinor())
                    .mergedCodMinor(c.codMinor())
                    .build();
        }).toList();
    }

    /** The order's return records for the drawer, with what each did and whether it can be undone. */
    private List<OrderReturnsView.ReturnRecordDto> returnRecords(Order o) {
        return returnsView.records(o, this::thumbnailsFor);
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
        Map<String, String> thumbnails = thumbnailsFor(orders.stream().flatMap(o -> o.getItems().stream()).toList());
        return orders.stream().map(o -> toDispatch(o, thumbnails)).toList();
    }

    @Transactional(readOnly = true)
    public DispatchOrderDto toDispatch(Order o) {
        return toDispatch(o, thumbnailsFor(o.getItems()));
    }

    private DispatchOrderDto toDispatch(Order o, Map<String, String> thumbnails) {
        OrderPaymentState pay = OrderPaymentState.of(o);
        List<DispatchOrderDto.DispatchItem> items = o.getItems().stream()
                .map(it -> new DispatchOrderDto.DispatchItem(
                        it.getTitleSnapshot(), it.getVariantNameSnapshot(),
                        it.getQuantity(), it.getPriceMinorSnapshot(),
                        it.getProductId() == null ? null : thumbnails.get(UuidUtil.toString(it.getProductId()))))
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
        for (ProductImage image : productImages.findImagesForProducts(productIds)) {
            // Results are ordered by sortOrder, so the first one seen per product wins.
            first.putIfAbsent(UuidUtil.toString(image.getProduct().getId()), image.getUrl());
        }
        return first;
    }

    private OrderItemDto toItemDto(Order o, OrderItem it, Map<String, String> thumbnails,
                                   CatalogNames.ItemNames names) {
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
                it.getReturnedQty(),
                it.isAutoGift(),
                it.getCaseRarity(),
                it.isVariantPending(),
                OrderMoney.unitPaidMinor(o, it),
                it.getReturnPendingQty());
    }

    /** Latest monobank invoice of the order, as the customer apps need it. */
    public OnlinePaymentDto onlinePayment(Order o) {
        return onlinePayments.summary(o.getId(), OrderMoney.amountDueMinor(o));
    }

    // expose for board grouping convenience
    public List<Order> byStatus(OrderStatus status) {
        return orderRepository.findByStatusOrderByCreatedAtDesc(status);
    }
}
