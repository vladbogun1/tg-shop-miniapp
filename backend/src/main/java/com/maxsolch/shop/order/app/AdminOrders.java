package com.maxsolch.shop.order.app;

import com.maxsolch.shop.gift.GiftCaseTier;
import com.maxsolch.shop.gift.GiftService;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.order.domain.SenderType;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * What the admin does with an order, one method per button: loads the order of the URL, runs the scenario and
 * writes the audit entry after the scenario's own transaction has committed. The controller only turns the request
 * into these arguments and the returned order into a page.
 *
 * <p>Not {@code @Transactional}: each scenario is one transaction of its own service, and the audit entry is
 * written on its own (a failed scenario leaves no entry). Status changes live in {@link AdminOrderStatusService},
 * returns in {@code returns.app.AdminReturns}.
 */
@Service
public class AdminOrders {

    private final AdminOrderQueries queries;
    private final OrderLookup orderLookup;
    private final Checkout checkout;
    private final OrderEditing editing;
    private final OrderPayments orderPayments;
    private final OrderArchive orderArchive;
    private final OrderGiftCases giftCases;
    private final OrderDeliveryEditing deliveryEditing;
    private final OrderMerge merges;
    private final OrderOnlinePayments payments;
    private final OrderDispatchNotifier dispatchNotifier;
    private final MessageService messageService;
    private final AdminAuditService audit;
    private final CurrentActor actor;

    public AdminOrders(AdminOrderQueries queries, OrderLookup orderLookup, Checkout checkout, OrderEditing editing,
                       OrderPayments orderPayments, OrderArchive orderArchive, OrderGiftCases giftCases,
                       OrderDeliveryEditing deliveryEditing, OrderMerge merges, OrderOnlinePayments payments,
                       OrderDispatchNotifier dispatchNotifier, MessageService messageService,
                       AdminAuditService audit, CurrentActor actor) {
        this.queries = queries;
        this.orderLookup = orderLookup;
        this.checkout = checkout;
        this.editing = editing;
        this.orderPayments = orderPayments;
        this.orderArchive = orderArchive;
        this.giftCases = giftCases;
        this.deliveryEditing = deliveryEditing;
        this.merges = merges;
        this.payments = payments;
        this.dispatchNotifier = dispatchNotifier;
        this.messageService = messageService;
        this.audit = audit;
        this.actor = actor;
    }

    /** Re-posts the dispatch cards of all approved orders; returns how many were posted. */
    public int broadcastDispatch() {
        int posted = dispatchNotifier.broadcastDispatch();
        audit.record("DISPATCH_BROADCAST", "ORDER", null, "карточек к отправке выложено заново: " + posted);
        return posted;
    }

    public Order updateTracking(String id, String trackingNumber) {
        OrderChange r = deliveryEditing.updateTracking(queries.load(id).getId(), trackingNumber);
        audit.record("ORDER_TRACKING", "ORDER", id, r.auditDetails());
        return r.order();
    }

    public Order updateDelivery(String id, OrderDeliveryEditing.DeliveryPatch patch) {
        OrderChange r = deliveryEditing.updateDelivery(queries.load(id).getId(), patch);
        audit.record("ORDER_DELIVERY", "ORDER", id, r.auditDetails());
        return r.order();
    }

    /** Other open orders of the customer that could be merged into order {@code id}. */
    public List<OrderMerge.Candidate> mergeCandidates(String id) {
        return merges.candidates(queries.load(id).getId());
    }

    /** Merges order {@code sourceId} into {@code id}; returns the target as it is after the merge. */
    public Order merge(String id, String sourceId, boolean useSourceDelivery, boolean notifyCustomer, String note) {
        Order target = queries.load(id);
        Order source = queries.load(sourceId);
        if (payments.hasPaymentInFlight(target.getId()) || payments.hasPaymentInFlight(source.getId())) {
            throw OrderErrors.badRequest("по одному из заказов банк ещё проводит оплату — подождите пару минут");
        }
        OrderMerge.Result r = merges.merge(target.getId(), source.getId(), useSourceDelivery, notifyCustomer,
                note, audit.currentAdminName());
        // The merged order will not be paid any more; the open pages of this one are for the old amount.
        payments.closeOpenInvoices(source.getId());
        payments.closeOpenInvoices(target.getId());
        audit.record("ORDER_MERGE", "ORDER", id, r.auditDetails());
        audit.record("ORDER_MERGED_INTO", "ORDER", UuidUtil.toString(source.getId()),
                "объединён в заказ #" + OrderMerge.shortId(target.getId()));
        return orderLookup.get(r.target().getId());
    }

    /** A sale typed in by hand; a blank {@code paidChannel} means OTHER. */
    public Order createByHand(CreateOrderCommand cmd, long paidMinor, String paidChannel, String note) {
        OrderMoneyMovement.Channel channel = channelOrOther(paidChannel);
        Order created = checkout.createAdminOrder(cmd, paidMinor, channel, audit.currentAdminName(), note);
        audit.record("ORDER_CREATE_ADMIN", "ORDER", UuidUtil.toString(created.getId()),
                "ручной заказ на " + MoneyFormat.uah(created.getTotalMinor())
                        + (paidMinor > 0
                                ? ", получено " + MoneyFormat.uah(paidMinor) + " ("
                                        + MoneyLedger.channelLabel(channel) + ")"
                                : ""));
        return created;
    }

    public Order setPaid(String id, long receivedMinor, String channelName, String note) {
        OrderMoneyMovement.Channel channel = channelOrOther(channelName);
        Order updated = orderPayments.markPaid(queries.load(id).getId(), receivedMinor, channel,
                audit.currentAdminName(), note);
        audit.record("ORDER_PAID", "ORDER", id,
                (receivedMinor > 0
                        ? "подтверждено получено: " + MoneyFormat.uah(receivedMinor)
                        : "оплата снята")
                        + " (" + MoneyLedger.channelLabel(channel) + ")"
                        + (note == null || note.isBlank() ? "" : "; " + note.trim()));
        return updated;
    }

    public Order addItem(String id, String productId, String variantId, int quantity, boolean gift,
                         boolean notifyCustomer) {
        Order updated = editing.addItem(queries.load(id).getId(), productId, variantId, quantity, gift, notifyCustomer);
        audit.record("ORDER_ITEM_ADD", "ORDER", id, (gift ? "подарок " : "позиция ") + productId + " x" + quantity);
        return updated;
    }

    /** An unknown or blank {@code tierName} gives SILVER. */
    public Order grantGiftCase(String id, String tierName, boolean notifyCustomer) {
        GiftCaseTier.Tier tier = GiftService.parseTier(tierName).orElse(GiftCaseTier.Tier.SILVER);
        Order updated = giftCases.grantGiftCase(queries.load(id).getId(), tier, notifyCustomer);
        String prize = updated.getItems().stream()
                .filter(i -> i.isAutoGift() && i.getCaseRarity() != null)
                .map(i -> i.getTitleSnapshot() + " (" + i.getCaseRarity() + ")")
                .findFirst().orElse("скидка");
        audit.record("ORDER_GIFT_CASE", "ORDER", id, "выдан кейс " + tier + ", приз: " + prize);
        return updated;
    }

    public Order changeItemQuantity(String id, long itemId, int quantity, boolean notifyCustomer) {
        Order updated = editing.changeItemQuantity(queries.load(id).getId(), itemId, quantity, notifyCustomer);
        audit.record("ORDER_ITEM_QTY", "ORDER", id, "позиция #" + itemId + " → x" + quantity);
        return updated;
    }

    public Order removeItem(String id, long itemId) {
        Order updated = editing.removeItem(queries.load(id).getId(), itemId);
        audit.record("ORDER_ITEM_REMOVE", "ORDER", id, "удалена позиция #" + itemId);
        return updated;
    }

    public Order applyDiscount(String id, String promoCode, Long amountMinor, Integer percent, boolean clear,
                               boolean notifyCustomer) {
        Order updated = editing.applyDiscount(queries.load(id).getId(), promoCode, amountMinor, percent, clear,
                notifyCustomer);
        audit.record("ORDER_DISCOUNT", "ORDER", id,
                clear ? "скидка снята"
                        : "скидка: " + (promoCode != null ? "промокод " + promoCode
                                : amountMinor != null ? MoneyFormat.uah(amountMinor)
                                : percent + "%"));
        return updated;
    }

    public Order archive(String id, String reason) {
        Order archived = orderArchive.archive(queries.load(id).getId(), reason, audit.currentAdminName());
        audit.record("ORDER_ARCHIVE", "ORDER", id,
                "в архив: " + archived.getCustomerName() + ", " + MoneyFormat.uah(archived.getTotalMinor())
                        + ", статус " + archived.getStatus() + "; причина: " + archived.getArchiveReason());
        return archived;
    }

    public Order unarchive(String id) {
        Order back = orderArchive.unarchive(queries.load(id).getId());
        audit.record("ORDER_UNARCHIVE", "ORDER", id, "возвращён из архива");
        return back;
    }

    /** An admin message in the order chat, signed with the acting admin. */
    public MessageDto sendMessage(String id, SendMessageRequest req) {
        Order order = queries.load(id);
        long adminId = actor.userId();
        return messageService.postAdminMessage(order.getId(), adminId, audit.currentAdminName(), req);
    }

    /** The customer's messages of the order are read. */
    public void markCustomerMessagesRead(String id) {
        messageService.markRead(queries.load(id).getId(), SenderType.CUSTOMER);
    }

    private static OrderMoneyMovement.Channel channelOrOther(String name) {
        return name == null || name.isBlank() ? OrderMoneyMovement.Channel.OTHER : MoneyLedger.parseChannel(name);
    }
}
