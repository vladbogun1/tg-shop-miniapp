package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.domain.ProductImage;
import com.maxsolch.shop.domain.SenderType;
import com.maxsolch.shop.i18n.CustomerRejectReason;
import com.maxsolch.shop.repository.OrderExchangeRepository;
import com.maxsolch.shop.repository.OrderItemRepository;
import com.maxsolch.shop.repository.OrderMessageRepository;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.payment.MonobankClient;
import com.maxsolch.shop.payment.PaymentInvoice;
import com.maxsolch.shop.payment.PaymentInvoiceRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.repository.ProductImageRepository;
import com.maxsolch.shop.translation.ContentLocale;
import com.maxsolch.shop.translation.TranslationEntityType;
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
    private final CustomerRejectReason customerRejectReason;
    private final OrderExchangeRepository exchangeRepository;

    /** The gift block of the order page (docs/GIFT-CASE.md); a setter so the tests' constructor stays. */
    private com.maxsolch.shop.gift.GiftCaseService giftCaseService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setGiftCaseService(@org.springframework.context.annotation.Lazy com.maxsolch.shop.gift.GiftCaseService giftCaseService) {
        this.giftCaseService = giftCaseService;
    }

    /** Return records for the drawer (V70); lazy — the adjustment service reads orders too. */
    private OrderAdjustmentService adjustments;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setAdjustments(@org.springframework.context.annotation.Lazy OrderAdjustmentService adjustments) {
        this.adjustments = adjustments;
    }

    public OrderQueryService(OrderRepository orderRepository,
                             OrderMessageRepository messageRepository,
                             OrderItemRepository orderItemRepository,
                             PaymentInvoiceRepository invoiceRepository,
                             MonobankClient monobank,
                             ProductImageRepository productImageRepository,
                             TranslationService translationService,
                             UserRepository userRepository,
                             CustomerRejectReason customerRejectReason,
                             OrderExchangeRepository exchangeRepository) {
        this.orderRepository = orderRepository;
        this.messageRepository = messageRepository;
        this.orderItemRepository = orderItemRepository;
        this.invoiceRepository = invoiceRepository;
        this.monobank = monobank;
        this.productImageRepository = productImageRepository;
        this.translationService = translationService;
        this.userRepository = userRepository;
        this.customerRejectReason = customerRejectReason;
        this.exchangeRepository = exchangeRepository;
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
                            OrderAdjustmentService.unitPaidMinor(it.getOrder(), it) * it.getReturnPendingQty()));
        }
        return out;
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
                o.getCancelRequestStatus(),
                o.getGiftCaseStatus(),
                OrderService.giftCaseOpenable(o),
                Math.max(0, o.getUncollectedMinor()));
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
                o.getCancelRequestStatus(),
                o.getArchivedAt() != null,
                o.getReturnStatus(),
                ctx.linesFor(id).stream().mapToInt(OrderCardDto.CardLine::returning).sum(),
                ctx.linesFor(id).stream().mapToInt(OrderCardDto.CardLine::returned).sum(),
                ctx.linesFor(id),
                o.getExchangeOfOrderId() == null ? null : UuidUtil.toString(o.getExchangeOfOrderId()),
                ctx.exchangesOf(id),
                Math.max(0, o.getUncollectedMinor()));
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
        return detail(o, ContentLocale.RU, false);
    }

    /**
     * Customer view: a line shows the product's current translation for {@code lang} when there is
     * one, else the snapshot. {@code order_items.title_snapshot} itself stays Russian — the seller,
     * the dispatch list and the channel read it. The shop's own rejection reasons (cancelled by the
     * customer, payment window ran out) are worded in the request's language too.
     */
    @Transactional(readOnly = true)
    public OrderDetailDto toDetail(Order o, String lang) {
        return detail(o, lang, true);
    }

    private OrderDetailDto detail(Order o, String lang, boolean customer) {
        List<OrderItem> orderItems = o.getItems();
        Map<String, String> thumbnails = thumbnailsFor(orderItems);
        TranslationService.ItemNames names = ContentLocale.isTranslated(lang)
                ? translationService.orderItemNames(
                        orderItems.stream().map(OrderItem::getProductId).filter(java.util.Objects::nonNull).toList(),
                        orderItems.stream().map(OrderItem::getVariantId).filter(java.util.Objects::nonNull).toList(),
                        lang)
                : TranslationService.ItemNames.EMPTY;
        // A sealed gift case keeps its prize a surprise: the customer sees the line after opening.
        boolean sealed = customer && OrderService.GIFT_CASE_SEALED.equals(o.getGiftCaseStatus());
        List<OrderItemDto> items = orderItems.stream()
                .filter(it -> !(sealed && it.isAutoGift() && it.getCaseRarity() != null))
                .map(it -> toItemDto(o, it, thumbnails, names))
                .toList();
        OnlinePaymentDto payment = onlinePayment(o);
        // The language the customer chose in the shop (users.locale): the admin answers in it.
        Long customerId = o.getUserId() != null ? o.getUserId() : o.getTgUserId();
        String customerLocale = customerId == null ? null : userRepository.localeOf(customerId).orElse(null);
        // The payment method is a Russian snapshot; the customer gets its translation while the
        // option still has the same title (content_translations, PAYMENT_OPTION/title).
        String paymentTitle = o.getPaymentOptionTitle();
        if (customer && o.getPaymentOptionId() != null && ContentLocale.isTranslated(lang)) {
            paymentTitle = translationService.overlay(lang).text(TranslationEntityType.PAYMENT_OPTION,
                    UuidUtil.toString(o.getPaymentOptionId()), TranslationEntityType.TITLE, paymentTitle);
        }
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
                paymentTitle,
                o.getTrackingNumber(),
                customer ? customerRejectReason.current(o.getRejectReason()) : o.getRejectReason(),
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
                // The admin sees what really arrived (an exchange for something cheaper leaves it
                // above the total — that overpayment is to be refunded); the customer, the capped.
                customer ? receivedMinor(o) : Math.max(0, o.getReceivedMinor()),
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
                o.getCancelRequestAdminComment(),
                customer ? List.of() : exchangeRepository.findByOrderIdOrderByCreatedAtAsc(o.getId()).stream()
                        .map(e -> new OrderDetailDto.ExchangeDto(e.getCreatedAt(), e.getPreviousStatus(),
                                e.getPreviousTracking(), e.getReturnedSummary(), e.getGivenSummary(),
                                e.getTotalBeforeMinor(), e.getTotalAfterMinor(), e.getNote(), e.getAdminName(),
                                e.getNewOrderId() == null ? null : UuidUtil.toString(e.getNewOrderId())))
                        .toList(),
                o.getGiftCaseStatus(),
                o.getGiftCaseOpenedAt(),
                OrderService.giftCaseOpenable(o),
                giftCaseService == null ? null : giftCaseService.orderGift(o, lang, customer),
                o.getGiftDiscountMinor(),
                o.getExchangeOfOrderId() == null ? null : UuidUtil.toString(o.getExchangeOfOrderId()),
                Math.max(0, o.getUncollectedMinor()),
                customer ? null : adminExtras(o));
    }

    /** Money journal and write-offs (optional: unit tests build the service without them). */
    private com.maxsolch.shop.repository.OrderMoneyMovementRepository movementRepository;
    private com.maxsolch.shop.repository.StockWriteoffRepository writeoffRepository;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setMovementRepository(com.maxsolch.shop.repository.OrderMoneyMovementRepository movementRepository) {
        this.movementRepository = movementRepository;
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setWriteoffRepository(com.maxsolch.shop.repository.StockWriteoffRepository writeoffRepository) {
        this.writeoffRepository = writeoffRepository;
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
        long monoLeft = invoiceRepository.findByOrderIdOrderByCreatedAtDesc(o.getId()).stream()
                .filter(i -> i.getAppliedAt() != null)
                .mapToLong(i -> Math.max(0, i.getAmountMinor() - i.getRefundedMinor()))
                .sum();
        List<OrderDetailDto.WriteoffDto> writeoffs = writeoffRepository == null ? List.of()
                : writeoffRepository.findByOrderIdOrderByCreatedAtAsc(o.getId()).stream()
                        .map(w -> new OrderDetailDto.WriteoffDto(w.getId() == null ? 0 : w.getId(), w.getTitle(),
                                w.getQuantity(), w.getUndoneQty(), w.getUndoneNote(), w.getReason(),
                                w.getUnitValueMinor(), w.getNote(), w.getAdminName(), w.getCreatedAt()))
                        .toList();
        return new OrderDetailDto.AdminExtras(o.getArchivedAt(), o.getArchivedBy(), o.getArchiveReason(),
                o.getReturnStatus(), o.getReturnReceivedAt(), movements, retained, monoLeft, writeoffs,
                o.getExchangeOfOrderId() == null ? null : UuidUtil.toString(o.getExchangeOfOrderId()),
                exchangeChildren(List.of(o.getId())).getOrDefault(UuidUtil.toString(o.getId()), List.of()),
                returnRecords(o),
                o.getMergedIntoOrderId() == null ? null : UuidUtil.toString(o.getMergedIntoOrderId()),
                orderRepository.mergedChildren(List.of(o.getId())).stream()
                        .map(r -> UuidUtil.toString((byte[]) r[1]))
                        .toList());
    }

    /** Rows of the «Объединить» window (V71). */
    public List<OrderDetailDto.MergeCandidateDto> mergeCandidates(List<OrderMergeService.Candidate> found) {
        return found.stream().map(c -> {
            Order o = c.order();
            return new OrderDetailDto.MergeCandidateDto(UuidUtil.toString(o.getId()), o.getStatus().name(),
                    o.getCreatedAt(), o.getTotalMinor(), Math.max(0, o.getReceivedMinor()), o.getPrepaymentMinor(), o.isPaid(),
                    o.getPaymentOptionTitle(), o.getNpCityName(), o.getNpWarehouseName(), o.getCustomerName(),
                    o.getTrackingNumber(), o.getGiftCaseStatus(),
                    o.getItems().stream()
                            .map(i -> i.getTitleSnapshot()
                                    + (i.getVariantNameSnapshot() == null ? "" : " (" + i.getVariantNameSnapshot() + ")")
                                    + " ×" + i.getQuantity() + (i.isGift() ? " · подарок" : ""))
                            .toList(),
                    c.blocker(), c.totalMinor(), c.receivedMinor(), c.amountDueMinor(), c.codMinor());
        }).toList();
    }

    /** The order's return records for the drawer, with what each did and whether it can be undone. */
    private List<OrderDetailDto.ReturnRecordDto> returnRecords(Order o) {
        if (adjustments == null) {
            return List.of();
        }
        List<com.maxsolch.shop.domain.OrderReturn> recs = adjustments.returnRecordsOf(o.getId());
        if (recs.isEmpty()) {
            return List.of();
        }
        Map<Long, List<com.maxsolch.shop.domain.OrderReturnLine>> byRecord = new java.util.HashMap<>();
        adjustments.returnLinesOf(recs.stream().map(com.maxsolch.shop.domain.OrderReturn::getId).toList())
                .forEach(l -> byRecord.computeIfAbsent(l.getReturnId(), k -> new ArrayList<>()).add(l));
        Map<Long, OrderItem> items = new java.util.HashMap<>();
        o.getItems().forEach(i -> { if (i.getId() != null) items.put(i.getId(), i); });
        Map<String, String> images = thumbnailsFor(o.getItems());
        com.maxsolch.shop.domain.OrderReturn newest = recs.stream().filter(r -> r.getCancelledAt() == null)
                .reduce((a, b) -> b).orElse(null);
        List<OrderDetailDto.ReturnRecordDto> out = new ArrayList<>();
        for (com.maxsolch.shop.domain.OrderReturn r : recs) {
            String newOrderId = null;
            Order replacement = null;
            if (r.getExchangeId() != null) {
                var ex = exchangeRepository.findById(r.getExchangeId()).orElse(null);
                if (ex != null && ex.getNewOrderId() != null) {
                    newOrderId = UuidUtil.toString(ex.getNewOrderId());
                    replacement = orderRepository.findById(ex.getNewOrderId()).orElse(null);
                }
            }
            List<OrderDetailDto.ReturnRecordLineDto> lines = byRecord.getOrDefault(r.getId(), List.of()).stream()
                    .map(l -> {
                        OrderItem it = items.get(l.getItemId());
                        String title = it == null ? "—" : it.getTitleSnapshot()
                                + (it.getVariantNameSnapshot() == null ? "" : " (" + it.getVariantNameSnapshot() + ")");
                        String img = it == null || it.getProductId() == null ? null
                                : images.get(UuidUtil.toString(it.getProductId()));
                        return new OrderDetailDto.ReturnRecordLineDto(l.getItemId(), title, img, l.getQuantity(),
                                l.getOutcome(), l.getRestockedQty(), l.getDefectQty(), l.pendingQty());
                    })
                    .toList();
            boolean isNewest = r == newest;
            String blocker = isNewest ? adjustments.cancelBlocker(r, replacement) : null;
            out.add(new OrderDetailDto.ReturnRecordDto(r.getId(), r.getKind(), r.getCreatedAt(), r.getAdminName(),
                    r.getNote(), lines, r.getRefundMinor(), r.getRefundChannel(), r.getMonoRefundMinor(), newOrderId,
                    r.getCancelledAt(), r.getCancelledBy(), r.getCancelNote(), r.getDebtMinor(), r.getDebtPaidAt(),
                    isNewest && blocker == null, blocker));
        }
        return out;
    }

    /** Exact amount actually received for the order (online payments + the admin "mark paid" dialog). */
    public static long receivedMinor(Order o) {
        return Math.min(Math.max(0, o.getReceivedMinor()), o.getTotalMinor());
    }

    /** Cash-on-delivery (наложка) to collect at Nova Poshta; units refused at the branch are not paid for. */
    public static long codMinor(Order o) {
        return Math.max(0, OrderService.collectableMinor(o) - receivedMinor(o));
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
        long received = receivedMinor(o);
        long cod = codMinor(o);
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

    private OrderItemDto toItemDto(Order o, OrderItem it, Map<String, String> thumbnails,
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
                it.getReturnedQty(),
                it.isAutoGift(),
                it.getCaseRarity(),
                it.isVariantPending(),
                OrderAdjustmentService.unitPaidMinor(o, it),
                it.getReturnPendingQty());
    }

    /** Latest monobank invoice of the order, as the customer apps need it. */
    public OnlinePaymentDto onlinePayment(Order o) {
        List<PaymentInvoice> list = invoiceRepository.findByOrderIdOrderByCreatedAtDesc(o.getId());
        if (list.isEmpty()) {
            return new OnlinePaymentDto(monobank.isEnabled(), "none", null, null, 0, null, null, null);
        }
        // A paid invoice wins over a newer abandoned one (the card/method is what the customer wants to see) —
        // unless money is still due on a paid order (an item was added: a top-up), then the latest attempt
        // is what the customer is paying right now.
        PaymentInvoice inv = OrderService.amountDueMinor(o) > 0
                ? list.get(0)
                : list.stream().filter(i -> i.getAppliedAt() != null).findFirst().orElse(list.get(0));
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
