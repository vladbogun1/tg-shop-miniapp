package com.maxsolch.shop.service;

import com.maxsolch.shop.domain.OrderMoney;

import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.domain.CancelRequestStatus;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderItemLot;
import com.maxsolch.shop.domain.OrderMoneyMovement;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.domain.RejectReasonCode;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.platform.error.BadRequestException;
import com.maxsolch.shop.platform.error.NotFoundException;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;

/**
 * Merging two orders of one customer that have not shipped yet (V71): the customer placed a second
 * order a few minutes after the first, and both go out as one parcel.
 *
 * <p>The order that stays ({@code target}) gets copies of the other one's lines, its discount and
 * the money it received (money journal, channel MERGE). The merged order ({@code source}) is never
 * deleted: it is closed as REJECTED with code MERGED, keeps its own lines for the history and points
 * at the target. Stock does not move — the units simply belong to the target now.
 */
@Service
public class OrderMergeService {

    /** Written into {@code orders.reject_reason}; the customer reads it via CustomerRejectReason. */
    public static final String MERGED_PREFIX = "Объединён с заказом #";

    private final OrderRepository orderRepository;
    private final OrderService orderService;
    private final ApplicationEventPublisher events;
    private final MoneyLedger moneyLedger;

    public OrderMergeService(OrderRepository orderRepository, OrderService orderService,
                             ApplicationEventPublisher events, MoneyLedger moneyLedger) {
        this.orderRepository = orderRepository;
        this.orderService = orderService;
        this.events = events;
        this.moneyLedger = moneyLedger;
    }

    /** One order the admin may merge with the open one, and what the merged order would look like. */
    public record Candidate(Order order, String blocker, long totalMinor, long receivedMinor,
                            long amountDueMinor, long codMinor) {
    }

    /** The other open orders of the same customer, newest first, each with a blocker or the result. */
    @Transactional(readOnly = true)
    public List<Candidate> candidates(byte[] orderId) {
        Order order = orderRepository.findWithItemsById(orderId)
                .orElseThrow(() -> new NotFoundException("order not found"));
        List<Order> open = new ArrayList<>();
        open.addAll(orderRepository.findWithItemsByStatus(OrderStatus.NEW));
        open.addAll(orderRepository.findWithItemsByStatus(OrderStatus.APPROVED));
        String own = blocker(order, true);
        return open.stream()
                .filter(o -> !Arrays.equals(o.getId(), order.getId()))
                .filter(o -> o.getArchivedAt() == null && sameCustomer(order, o))
                .sorted((a, b) -> b.getCreatedAt() == null || a.getCreatedAt() == null ? 0
                        : b.getCreatedAt().compareTo(a.getCreatedAt()))
                .map(o -> {
                    String why = own != null ? own : blocker(o, false);
                    Order preview = preview(order, o);
                    return new Candidate(o, why, preview.getTotalMinor(), preview.getReceivedMinor(),
                            OrderMoney.amountDueMinor(preview), OrderMoney.codMinor(preview));
                })
                .toList();
    }

    /** Result: the order that stays and the audit line. */
    public record Result(Order target, Order source, String auditDetails) {
    }

    /**
     * Merges {@code sourceId} into {@code targetId}.
     *
     * @param useSourceDelivery take the recipient and the Nova Poshta address of the merged order
     * @param notifyCustomer    one bot message: the orders are now one, what is left to pay
     */
    @Transactional
    public Result merge(byte[] targetId, byte[] sourceId, boolean useSourceDelivery, boolean notifyCustomer,
                        String note, String adminName) {
        if (Arrays.equals(targetId, sourceId)) {
            throw new BadRequestException("выберите другой заказ");
        }
        String cleanNote = note == null || note.isBlank() ? null : note.trim();
        if (cleanNote != null && cleanNote.length() > 500) {
            throw new BadRequestException("комментарий длиннее 500 символов");
        }
        // Rows are locked in id order, so two admins merging the same pair cannot deadlock.
        boolean targetFirst = Arrays.compareUnsigned(targetId, sourceId) < 0;
        Order first = orderService.lock(targetFirst ? targetId : sourceId);
        Order second = orderService.lock(targetFirst ? sourceId : targetId);
        Order target = targetFirst ? first : second;
        Order source = targetFirst ? second : first;
        if (!sameCustomer(target, source)) {
            throw new BadRequestException("объединять можно только заказы одного покупателя");
        }
        String blocked = blocker(target, true);
        if (blocked == null) {
            blocked = blocker(source, false);
        }
        if (blocked != null) {
            throw new BadRequestException(blocked);
        }
        String targetShort = shortId(target.getId());
        String sourceShort = shortId(source.getId());

        // 1. Lines: copies on the target (the same product at the same price adds up).
        List<String> moved = new ArrayList<>();
        for (OrderItem from : source.getItems()) {
            OrderItem same = from.isGift() ? null : target.getItems().stream()
                    .filter(i -> !i.isGift() && Arrays.equals(i.getProductId(), from.getProductId())
                            && Arrays.equals(i.getVariantId(), from.getVariantId())
                            && i.getPriceMinorSnapshot() == from.getPriceMinorSnapshot()
                            && i.isVariantPending() == from.isVariantPending())
                    .findFirst().orElse(null);
            OrderItem to;
            if (same != null) {
                same.setQuantity(same.getQuantity() + from.getQuantity());
                to = same;
            } else {
                to = copy(from, target);
                target.getItems().add(to);
            }
            moveLots(from, to);
            moved.add(from.getTitleSnapshot()
                    + (from.getVariantNameSnapshot() == null ? "" : " (" + from.getVariantNameSnapshot() + ")")
                    + " ×" + from.getQuantity());
        }

        // 2. Discounts add up (a promo code, a manual one, the case tier's guaranteed one).
        target.setDiscountMinor(target.getDiscountMinor() + source.getDiscountMinor());
        target.setGiftDiscountMinor(target.getGiftDiscountMinor() + source.getGiftDiscountMinor());
        target.setPromoCode(joinPromo(target.getPromoCode(), source.getPromoCode()));
        if (target.getGiftTier() == null) {
            target.setGiftTier(source.getGiftTier());
        }
        if (source.getComment() != null && !source.getComment().isBlank()) {
            String c = (target.getComment() == null || target.getComment().isBlank() ? ""
                    : target.getComment().trim() + "\n") + "#" + sourceShort + ": " + source.getComment().trim();
            target.setComment(c.length() > 1000 ? c.substring(0, 1000) : c);
        }
        if (useSourceDelivery) {
            target.setCustomerName(source.getCustomerName());
            target.setPhone(source.getPhone());
            target.setDeliveryMethod(source.getDeliveryMethod());
            target.setNpCityRef(source.getNpCityRef());
            target.setNpCityName(source.getNpCityName());
            target.setNpWarehouseRef(source.getNpWarehouseRef());
            target.setNpWarehouseName(source.getNpWarehouseName());
        }
        orderService.recomputeOrderTotals(target);

        // 3. Money: what the merged order received moves over (no real money moves).
        long money = OrderMoney.refundableMinor(source);
        if (money > 0) {
            ledger(source, OrderMoneyMovement.Kind.REFUND, money, adminName, "перенесено в заказ #" + targetShort);
            source.setRefundedMinor(Math.max(0, source.getRefundedMinor()) + money);
            ledger(target, OrderMoneyMovement.Kind.PAYMENT, money, adminName, "перенесено из заказа #" + sourceShort);
            target.setReceivedMinor(Math.max(0, target.getReceivedMinor()) + money);
        }
        boolean paid = target.getReceivedMinor() > 0 || target.getTotalMinor() == 0;
        if (paid && !target.isPaid()) {
            target.setPaidAt(source.getPaidAt() != null ? source.getPaidAt() : Instant.now());
        }
        target.setPaid(paid);
        if (paid && OrderMoney.amountDueMinor(target) == 0) {
            target.setPaymentDueAt(null);
        }

        // 4. The merged order is closed, keeping its lines and money history.
        source.setStatus(OrderStatus.REJECTED);
        source.setRejectedAt(Instant.now());
        source.setRejectReasonCode(RejectReasonCode.MERGED.name());
        source.setRejectReason(MERGED_PREFIX + targetShort);
        source.setMergedIntoOrderId(target.getId());
        source.setPaymentDueAt(null);

        Order savedTarget = orderRepository.save(target);
        Order savedSource = orderRepository.save(source);
        events.publishEvent(new OrderEvents.Merged(savedTarget.getId(), savedSource.getId(), notifyCustomer));

        String details = "объединён с #" + sourceShort + ": " + String.join(", ", moved)
                + "; итого " + MoneyFormat.uah(savedTarget.getTotalMinor())
                + (money > 0 ? "; перенесено оплаченное " + MoneyFormat.uah(money) : "")
                + (useSourceDelivery ? "; адрес из #" + sourceShort : "")
                + (cleanNote == null ? "" : "; " + cleanNote);
        return new Result(savedTarget, savedSource, details);
    }

    /**
     * Why this order cannot take part in a merge now; null = it can.
     *
     * @param staying the order that stays (a sealed gift case may stay with it, not move away)
     */
    static String blocker(Order o, boolean staying) {
        String id = "#" + shortId(o.getId());
        if (!OrderTransitions.isOpen(o)) {
            return "заказ " + id + " уже не новый и не одобренный — объединять можно только до отправки";
        }
        if (o.getArchivedAt() != null) {
            return "заказ " + id + " в архиве";
        }
        if (CancelRequestStatus.PENDING.name().equals(o.getCancelRequestStatus())) {
            return "покупатель просит отменить заказ " + id + " — сначала ответьте на запрос";
        }
        if (o.getExchangeOfOrderId() != null) {
            return "заказ " + id + " — замена по обмену, его не объединяют";
        }
        if (!staying && o.getTrackingNumber() != null && !o.getTrackingNumber().isBlank()) {
            return "у заказа " + id + " уже есть ТТН — оставьте основным его или удалите ТТН";
        }
        if (!staying && OrderService.GIFT_CASE_SEALED.equals(o.getGiftCaseStatus())) {
            return "в заказе " + id + " не открыт кейс — оставьте основным его";
        }
        return null;
    }

    /** One customer: the same Telegram account, the same site account or the same phone. */
    static boolean sameCustomer(Order a, Order b) {
        if (a.getTgUserId() != null && a.getTgUserId() > 0 && Objects.equals(a.getTgUserId(), b.getTgUserId())) {
            return true;
        }
        if (a.getUserId() != null && Objects.equals(a.getUserId(), b.getUserId())) {
            return true;
        }
        String pa = phoneKey(a.getPhone());
        return pa != null && pa.equals(phoneKey(b.getPhone()));
    }

    /** The last 9 digits: +380 67…, 067…, 67… are one number. */
    private static String phoneKey(String phone) {
        if (phone == null) {
            return null;
        }
        String d = phone.replaceAll("\\D", "");
        return d.length() < 9 ? null : d.substring(d.length() - 9);
    }

    /** The target as it would be after the merge (numbers only, nothing saved). */
    private static Order preview(Order target, Order source) {
        Order p = new Order();
        p.setTotalMinor(target.getTotalMinor() + source.getTotalMinor());
        p.setPrepaymentMinor(target.getPrepaymentMinor());
        p.setReceivedMinor(Math.max(0, target.getReceivedMinor())
                + OrderMoney.refundableMinor(source));
        return p;
    }

    private static OrderItem copy(OrderItem from, Order to) {
        OrderItem i = new OrderItem();
        i.setOrder(to);
        i.setProductId(from.getProductId());
        i.setTitleSnapshot(from.getTitleSnapshot());
        i.setPriceMinorSnapshot(from.getPriceMinorSnapshot());
        i.setVariantId(from.getVariantId());
        i.setVariantNameSnapshot(from.getVariantNameSnapshot());
        i.setQuantity(from.getQuantity());
        i.setGift(from.isGift());
        i.setAutoGift(from.isAutoGift());
        i.setCaseRarity(from.getCaseRarity());
        i.setGiftValueMinor(from.getGiftValueMinor());
        i.setVariantPending(from.isVariantPending());
        return i;
    }

    /** The stock lots the units came from move with them (V74 cost of goods), never counted twice. */
    private static void moveLots(OrderItem from, OrderItem to) {
        if (from.getLots() == null || from.getLots().isEmpty()) {
            return;
        }
        for (OrderItemLot a : from.getLots()) {
            OrderItemLot b = new OrderItemLot();
            b.setItem(to);
            b.setLotId(a.getLotId());
            b.setQty(a.getQty());
            b.setCreatedAt(a.getCreatedAt());
            to.getLots().add(b);
        }
        from.getLots().clear();
    }

    private static String joinPromo(String a, String b) {
        if (b == null || b.isBlank() || b.equals(a)) {
            return a;
        }
        if (a == null || a.isBlank()) {
            return b;
        }
        String s = a + " + " + b;
        return s.length() > 64 ? s.substring(0, 63) + "…" : s;
    }

    private void ledger(Order order, OrderMoneyMovement.Kind kind, long amount, String adminName, String note) {
        moneyLedger.record(order.getId(), kind, OrderMoneyMovement.Channel.MERGE, amount,
                OrderMoneyMovement.Source.ADMIN, adminName, note, null);
    }

    public static String shortId(byte[] id) {
        String s = id == null ? "" : UuidUtil.toString(id);
        return s == null || s.length() < 8 ? String.valueOf(s) : s.substring(0, 8);
    }
}
