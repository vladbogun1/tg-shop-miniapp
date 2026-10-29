package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.CancelRequestStatus;
import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.domain.RejectCause;
import com.maxsolch.shop.order.domain.RejectReasonCode;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.platform.i18n.CustomerRejectReason;
import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.inventory.app.OrderStock;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * How an order moves through its statuses: approve, ship, deliver, reject (with or without putting the goods
 * back, with the parcel on its way back), the non-payment timeout, and the seller dispatch cards. The rules of
 * each move live in {@link Order}; this class takes the row lock, does what the move costs (stock, money
 * journal) and hands the Telegram side to the after-commit listener.
 */
@Service
public class OrderLifecycle {

    private final OrderOps ops;
    private final OrderRepository orderRepository;
    private final OrderStock stock;
    private final ApplicationEventPublisher events;
    private final AppProperties props;

    OrderLifecycle(OrderOps ops, OrderRepository orderRepository, OrderStock stock, ApplicationEventPublisher events,
                   AppProperties props) {
        this.ops = ops;
        this.orderRepository = orderRepository;
        this.stock = stock;
        this.events = events;
        this.props = props;
    }

    @Transactional
    public Order approve(byte[] orderId) {
        Order order = ops.lock(orderId);
        order.approve(ops.now());
        return ops.afterTransition(order);
    }

    @Transactional
    public Order ship(byte[] orderId, String trackingNumber) {
        return ship(orderId, trackingNumber, false);
    }

    /**
     * @param allowUnpaid the admin confirmed shipping although the online payment (prepayment or
     *                    the whole order) has not arrived, e.g. agreed with the customer in the chat
     */
    @Transactional
    public Order ship(byte[] orderId, String trackingNumber, boolean allowUnpaid) {
        Order order = ops.lock(orderId);
        order.ship(trackingNumber, allowUnpaid, ops.now());
        return ops.afterTransition(order);
    }

    @Transactional
    public Order deliver(byte[] orderId) {
        Order order = ops.lock(orderId);
        long receivedBefore = order.getReceivedMinor();
        order.deliver(ops.now());
        ops.ledger(order, OrderMoneyMovement.Kind.PAYMENT,
                order.getDeliveryMethod() == DeliveryMethod.NOVA_POSHTA
                        ? OrderMoneyMovement.Channel.NP_COD : OrderMoneyMovement.Channel.CASH,
                order.getReceivedMinor() - receivedBefore, OrderMoneyMovement.Source.AUTO, null,
                order.getUncollectedMinor() > 0
                        ? "остаток при получении (частичный выкуп, не выкуплено "
                                + MoneyFormat.uah(order.getUncollectedMinor()) + ")"
                        : "остаток при получении (доставлен)", null);
        return ops.afterTransition(order);
    }

    /**
     * Admin reject/cancel. Allowed from ANY status (incl. DELIVERED, e.g. a customer
     * return at Nova Poshta). {@code restock} controls whether the items go back on the
     * shelf (skip it when the returned goods are not in sellable condition).
     */
    @Transactional
    public Order reject(byte[] orderId, String reason, boolean restock) {
        return reject(orderId, reason, null, restock);
    }

    /**
     * Admin reject with a reason code from the fixed list ({@link RejectReasonCode}) and an
     * optional free-text explanation. Blank text is stored as null, so the customer gets the plain
     * "order rejected" note instead of an empty "Reason:".
     */
    @Transactional
    public Order reject(byte[] orderId, String reason, RejectReasonCode reasonCode, boolean restock) {
        return reject(orderId, reason, reasonCode, restock, false);
    }

    /**
     * @param returnInTransit only for a SHIPPED order (refused at the post office, sent back): the
     *                        goods are not on the shelf yet, so nothing is restocked now; the
     *                        order waits as "parcel on its way back" until it is received
     *                        ({@code ReturnReceiving.receive}).
     */
    @Transactional
    public Order reject(byte[] orderId, String reason, RejectReasonCode reasonCode, boolean restock,
                        boolean returnInTransit) {
        Order order = ops.lock(orderId);
        OrderStatus before = order.getStatus();
        order.requireRejectable();
        Instant now = ops.now();
        boolean inTransit = returnInTransit && before == OrderStatus.SHIPPED;
        if (inTransit) {
            order.markReturnInTransit(now);
        } else if (restock) {
            stock.restoreAll(order);
        }
        long kept = OrderMoney.keptMinor(order);
        if (before == OrderStatus.SHIPPED && kept > 0 && order.getPrepaymentMinor() > 0
                && kept <= order.getPrepaymentMinor()) {
            // Owner rule (25.10.2026): the prepayment of a refused parcel pays for its delivery
            // both ways: it stays with the shop and is never refunded automatically.
            ops.ledger(order, OrderMoneyMovement.Kind.RETAINED, OrderMoneyMovement.Channel.OTHER, kept,
                    OrderMoneyMovement.Source.AUTO, null, "предоплата удержана: доставка", null);
        }
        boolean requestWasOpen = order.isCancelRequestPending();
        if (requestWasOpen) {
            // Rejected by hand while the customer request was open: the request is fulfilled
            // (the refund, if any, stays the admin call; the inbox keeps reminding).
            order.setCancelRequestStatus(CancelRequestStatus.APPROVED.name());
            order.setCancelRequestResolvedAt(now);
        }
        Order saved = ops.reject(order, new RejectCause(now,
                reason == null || reason.isBlank() ? null : reason.trim(),
                reasonCode == null ? null : reasonCode.name(), false));
        if (requestWasOpen) {
            // The customer asked to cancel and got what they asked for: answer like approveCancelRequest does.
            events.publishEvent(new OrderEvents.CancelRequestResolved(saved.getId(), true));
        }
        return saved;
    }

    /** Dispatcher used by the admin board / status PATCH endpoint. */
    @Transactional
    public Order changeStatus(byte[] orderId, OrderStatus target, String trackingNumber,
                              String reason, boolean restock) {
        return changeStatus(orderId, target, trackingNumber, reason, null, restock);
    }

    /** Same, with the structured reject reason. */
    @Transactional
    public Order changeStatus(byte[] orderId, OrderStatus target, String trackingNumber,
                              String reason, RejectReasonCode reasonCode, boolean restock) {
        return changeStatus(orderId, target, trackingNumber, reason, reasonCode, restock, false);
    }

    /** Same, with the admin confirmation to ship without the prepayment, for SHIPPED. */
    @Transactional
    public Order changeStatus(byte[] orderId, OrderStatus target, String trackingNumber,
                              String reason, RejectReasonCode reasonCode, boolean restock, boolean allowUnpaid) {
        return switch (target) {
            case APPROVED -> approve(orderId);
            case SHIPPED -> ship(orderId, trackingNumber, allowUnpaid);
            case DELIVERED -> deliver(orderId);
            case REJECTED -> reject(orderId, reason, reasonCode, restock, false);
            case NEW -> throw OrderErrors.badRequest("вернуть заказ в «Новые» нельзя");
        };
    }

    /**
     * The online payment deadline passed with nothing paid: reject the order (reason
     * PAYMENT_TIMEOUT) and put the goods back on the shelf. Re-checked under the row lock, so a
     * payment that landed meanwhile wins. Returns null when the order no longer qualifies.
     */
    @Transactional
    public Order expireUnpaid(byte[] orderId, Instant now) {
        Order order = ops.lock(orderId);
        if (order.getStatus() != OrderStatus.NEW || order.isPaid() || order.getReceivedMinor() > 0
                || order.getPaymentDueAt() == null || order.getPaymentDueAt().isAfter(now)) {
            return null;
        }
        stock.restoreAll(order);
        return ops.reject(order, new RejectCause(now,
                CustomerRejectReason.UNPAID_PREFIX + Math.max(1, props.getPayment().getDueHours()) + " ч",
                RejectReasonCode.PAYMENT_TIMEOUT.name(), false));
    }
}
