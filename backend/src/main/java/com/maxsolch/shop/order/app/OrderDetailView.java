package com.maxsolch.shop.order.app;

import com.maxsolch.shop.catalog.app.CatalogNames;
import com.maxsolch.shop.customer.app.Customers;
import com.maxsolch.shop.inventory.app.StockWriteoffs;
import com.maxsolch.shop.order.domain.GiftCaseRules;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderPaymentState;
import com.maxsolch.shop.order.infra.OrderMoneyMovementRepository;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.translation.app.TranslationService;
import com.maxsolch.shop.translation.domain.ContentLocale;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Predicate;

/**
 * The order page, read side: the customer's view (translated names, a sealed case prize hidden) and the admin's
 * (Russian snapshots, plus the money journal, write-offs, returns, exchanges and merges). Runs inside the
 * read-only transaction of {@link OrderQueryService}, which is its only entry.
 */
@Component
class OrderDetailView {

    private final OrderRepository orderRepository;
    private final OrderOnlinePayments onlinePayments;
    private final OrderThumbnails thumbnails;
    private final TranslationService translationService;
    private final CatalogNames catalogNames;
    private final Customers userRepository;
    private final CustomerRejectReason customerRejectReason;
    private final OrderReturnsView returnsView;
    /** The gift block of the order page (docs/GIFT-CASE.md). */
    private final OrderGiftView gift;
    /** Money journal and write-offs shown to the admin. */
    private final OrderMoneyMovementRepository movementRepository;
    private final StockWriteoffs writeoffRepository;

    OrderDetailView(OrderRepository orderRepository,
                    OrderOnlinePayments onlinePayments,
                    OrderThumbnails thumbnails,
                    TranslationService translationService,
                    CatalogNames catalogNames,
                    Customers userRepository,
                    CustomerRejectReason customerRejectReason,
                    OrderReturnsView returnsView,
                    OrderMoneyMovementRepository movementRepository,
                    StockWriteoffs writeoffRepository,
                    OrderGiftView gift) {
        this.orderRepository = orderRepository;
        this.onlinePayments = onlinePayments;
        this.thumbnails = thumbnails;
        this.translationService = translationService;
        this.catalogNames = catalogNames;
        this.userRepository = userRepository;
        this.customerRejectReason = customerRejectReason;
        this.returnsView = returnsView;
        this.movementRepository = movementRepository;
        this.writeoffRepository = writeoffRepository;
        this.gift = gift;
    }

    OrderDetailDto customerView(Order o, String lang) {
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

    OrderDetailDto adminView(Order o) {
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

    /** Latest monobank invoice of the order, as the customer apps need it. */
    OnlinePaymentDto onlinePayment(Order o) {
        return onlinePayments.summary(o.getId(), OrderMoney.amountDueMinor(o));
    }

    /**
     * What the customer and the admin views share. The fields they word or fill differently
     * (payment title, reject reason, received, exchanges, gift, admin block) are left for the caller.
     */
    private OrderDetailDto.OrderDetailDtoBuilder detailCore(Order o, String lang, Predicate<OrderItem> visible) {
        List<OrderItem> orderItems = o.getItems();
        Map<String, String> thumbnails = this.thumbnails.of(orderItems);
        CatalogNames.ItemNames names = ContentLocale.isTranslated(lang)
                ? catalogNames.orderItemNames(
                        orderItems.stream().map(OrderItem::getProductId).filter(Objects::nonNull).toList(),
                        orderItems.stream().map(OrderItem::getVariantId).filter(Objects::nonNull).toList(),
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
                .source(OrderQueryService.sourceOf(o))
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
                .exchangeOrderIds(exchangeOrderIdsOf(o))
                .returns(returnRecords(o))
                .mergedIntoId(o.getMergedIntoOrderId() == null ? null : UuidUtil.toString(o.getMergedIntoOrderId()))
                .mergedFromIds(orderRepository.mergedChildren(List.of(o.getId())).stream()
                        .map(r -> UuidUtil.toString((byte[]) r[1]))
                        .toList())
                .build();
    }

    /** The exchange replacements of this order (V69). */
    private List<String> exchangeOrderIdsOf(Order o) {
        String id = UuidUtil.toString(o.getId());
        return orderRepository.exchangeChildren(List.of(o.getId())).stream()
                .filter(r -> id.equals(UuidUtil.toString((byte[]) r[0])))
                .map(r -> UuidUtil.toString((byte[]) r[1]))
                .toList();
    }

    /** The order's return records for the drawer, with what each did and whether it can be undone. */
    private List<OrderReturnsView.ReturnRecordDto> returnRecords(Order o) {
        return returnsView.records(o, thumbnails::of);
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
}
