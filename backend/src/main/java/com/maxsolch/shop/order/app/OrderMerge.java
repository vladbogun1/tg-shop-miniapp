package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.OrderEvents;

import com.maxsolch.shop.order.domain.GiftCaseRules;
import com.maxsolch.shop.order.domain.OrderTransitions;
import com.maxsolch.shop.order.domain.OrderMoney;

import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.CancelRequestStatus;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.platform.tx.DomainEvents;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
public class OrderMerge {

    /** Written into {@code orders.reject_reason}; the customer reads it via CustomerRejectReason. */
    public static final String MERGED_PREFIX = "Объединён с заказом #";

    private final OrderRepository orderRepository;
    private final OrderOps ops;
    private final DomainEvents events;
    private final MoneyLedger moneyLedger;

    public OrderMerge(OrderRepository orderRepository, OrderOps ops,
                             DomainEvents events, MoneyLedger moneyLedger) {
        this.orderRepository = orderRepository;
        this.ops = ops;
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
                .orElseThrow(() -> OrderErrors.notFound("order not found"));
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
                    // the target as it would be after the merge: numbers only, nothing saved
                    long total = order.getTotalMinor() + o.getTotalMinor();
                    long received = Math.max(0, order.getReceivedMinor()) + OrderMoney.refundableMinor(o);
                    return new Candidate(o, why, total, received,
                            OrderMoney.amountDueMinor(total, order.getPrepaymentMinor(), received),
                            OrderMoney.codMinor(total, 0, received));
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
            throw OrderErrors.badRequest("выберите другой заказ");
        }
        String cleanNote = note == null || note.isBlank() ? null : note.trim();
        if (cleanNote != null && cleanNote.length() > 500) {
            throw OrderErrors.badRequest("комментарий длиннее 500 символов");
        }
        // Rows are locked in id order, so two admins merging the same pair cannot deadlock.
        boolean targetFirst = Arrays.compareUnsigned(targetId, sourceId) < 0;
        Order first = ops.lock(targetFirst ? targetId : sourceId);
        Order second = ops.lock(targetFirst ? sourceId : targetId);
        Order target = targetFirst ? first : second;
        Order source = targetFirst ? second : first;
        if (!sameCustomer(target, source)) {
            throw OrderErrors.badRequest("объединять можно только заказы одного покупателя");
        }
        String blocked = blocker(target, true);
        if (blocked == null) {
            blocked = blocker(source, false);
        }
        if (blocked != null) {
            throw OrderErrors.badRequest(blocked);
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
                same.addQuantity(from.getQuantity());
                to = same;
            } else {
                to = from.copyTo(target);
                target.addLine(to);
            }
            to.takeLotsOf(from);
            moved.add(from.getTitleSnapshot()
                    + (from.getVariantNameSnapshot() == null ? "" : " (" + from.getVariantNameSnapshot() + ")")
                    + " ×" + from.getQuantity());
        }

        // 2. Discounts add up (a promo code, a manual one, the case tier's guaranteed one).
        target.absorbDiscountsOf(source, joinPromo(target.getPromoCode(), source.getPromoCode()));
        if (source.getComment() != null && !source.getComment().isBlank()) {
            String c = (target.getComment() == null || target.getComment().isBlank() ? ""
                    : target.getComment().trim() + "\n") + "#" + sourceShort + ": " + source.getComment().trim();
            target.changeComment(c.length() > 1000 ? c.substring(0, 1000) : c);
        }
        if (useSourceDelivery) {
            target.takeRecipientOf(source);
        }
        ops.recomputeTotals(target);

        // 3. Money: what the merged order received moves over (no real money moves).
        long money = OrderMoney.refundableMinor(source);
        if (money > 0) {
            ledger(source, OrderMoneyMovement.Kind.REFUND, money, adminName, "перенесено в заказ #" + targetShort);
            source.registerRefund(money);
            ledger(target, OrderMoneyMovement.Kind.PAYMENT, money, adminName, "перенесено из заказа #" + sourceShort);
        }
        target.absorbPaid(money, source, ops.now());

        // 4. The merged order is closed, keeping its lines and money history.
        source.markMerged(ops.now(), MERGED_PREFIX + targetShort, target.getId());

        Order savedTarget = orderRepository.save(target);
        Order savedSource = orderRepository.save(source);
        events.publish(new OrderEvents.Merged(savedTarget.getId(), savedSource.getId(), notifyCustomer));

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
        if (!staying && GiftCaseRules.GIFT_CASE_SEALED.equals(o.getGiftCaseStatus())) {
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
