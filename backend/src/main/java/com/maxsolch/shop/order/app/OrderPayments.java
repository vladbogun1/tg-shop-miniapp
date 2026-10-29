package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.util.MoneyFormat;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Money arriving at and leaving an order: the admin's "received" (cash, card, transfer), an online payment that
 * succeeded and a refund that went through at monobank. Each change goes to the money journal with its channel.
 */
@Service
public class OrderPayments {

    private final OrderOps ops;
    private final OrderRepository orderRepository;
    private final ApplicationEventPublisher events;

    OrderPayments(OrderOps ops, OrderRepository orderRepository, ApplicationEventPublisher events) {
        this.ops = ops;
        this.orderRepository = orderRepository;
        this.events = events;
    }

    /**
     * Sets the amount actually received (admin-only: the payment dialog, or an automatic
     * settlement on delivery). {@code 0} clears the payment.
     */
    @Transactional
    public Order markPaid(byte[] orderId, long receivedMinor) {
        return markPaid(orderId, receivedMinor, OrderMoneyMovement.Channel.OTHER, null, null);
    }

    /**
     * Same, naming how the money came ({@code channel}, the admin, a note) for the money journal:
     * a raise is a PAYMENT through that channel, a cut a negative CORRECTION.
     */
    @Transactional
    public Order markPaid(byte[] orderId, long receivedMinor, OrderMoneyMovement.Channel channel,
                          String adminName, String note) {
        Order order = ops.lock(orderId);
        if (receivedMinor < 0) {
            throw OrderErrors.badRequest("сумма не может быть отрицательной");
        }
        if (receivedMinor > order.getTotalMinor()) {
            // Used to be clamped silently: a typo (an extra zero) recorded "paid in full" without
            // the admin noticing the amount they typed was never what got saved.
            throw OrderErrors.badRequest("получено больше суммы заказа ("
                    + MoneyFormat.uah(order.getTotalMinor()) + ")");
        }
        long received = receivedMinor;
        long diff = received - order.getReceivedMinor();
        ops.ledger(order, diff > 0 ? OrderMoneyMovement.Kind.PAYMENT : OrderMoneyMovement.Kind.CORRECTION,
                channel == null ? OrderMoneyMovement.Channel.OTHER : channel, diff,
                OrderMoneyMovement.Source.ADMIN, adminName,
                note == null || note.isBlank() ? (diff > 0 ? "отмечено получено" : "исправлено «получено»") : note,
                null);
        order.setReceivedMinor(received);
        boolean paid = received > 0 || order.getTotalMinor() == 0; // a free order stays paid (settleIfFree)
        // Correcting the amount of an order that is already paid keeps the original payment date:
        // resetting it to "now" moved the money to the day of the edit in the metrics ("Получено").
        boolean wasPaid = order.isPaid() && order.getPaidAt() != null;
        order.setPaid(paid);
        order.setPaidAt(!paid ? null : wasPaid ? order.getPaidAt() : ops.now());
        Order saved = orderRepository.save(order);
        // COD on the seller's card changes with the received amount: keep it in sync.
        events.publishEvent(OrderEvents.Edited.silent(saved.getId()));
        return saved;
    }

    /**
     * Money arrived online (a monobank invoice succeeded). Adds it to the received amount, which
     * drives COD, and marks the order paid. The status is NOT moved: an admin still confirms
     * the order by hand (if the goods turn out unavailable, the money is refunded).
     */
    @Transactional
    public Order recordOnlinePayment(byte[] orderId, long amountMinor) {
        return recordOnlinePayment(orderId, amountMinor, null);
    }

    @Transactional
    public Order recordOnlinePayment(byte[] orderId, long amountMinor, String invoiceExtId) {
        Order order = ops.lock(orderId);
        long before = Math.max(0, order.getReceivedMinor());
        long received = Math.min(order.getTotalMinor(), before + amountMinor);
        // The journal books what the order counts (received is capped at the total), so it always
        // matches received - refunded; the bank's full amount stays in the note.
        long counted = Math.max(0, received - before);
        ops.ledger(order, OrderMoneyMovement.Kind.PAYMENT, OrderMoneyMovement.Channel.MONO, counted,
                OrderMoneyMovement.Source.AUTO, null,
                counted == amountMinor ? "оплата monobank"
                        : "оплата monobank " + MoneyFormat.uah(amountMinor) + ", зачтено в пределах суммы заказа",
                invoiceExtId);
        order.setReceivedMinor(received);
        if (received > 0 && !order.isPaid()) {
            order.setPaid(true);
            order.setPaidAt(ops.now());
        }
        Order saved = orderRepository.save(order);
        events.publishEvent(new OrderEvents.PaymentReceived(saved.getId(), amountMinor));
        return saved;
    }

    /** A refund went through at monobank: book it as money given back to the customer. */
    @Transactional
    public Order recordOnlineRefund(byte[] orderId, long amountMinor) {
        return recordOnlineRefund(orderId, amountMinor, null);
    }

    @Transactional
    public Order recordOnlineRefund(byte[] orderId, long amountMinor, String invoiceExtId) {
        Order order = ops.lock(orderId);
        ops.ledger(order, OrderMoneyMovement.Kind.REFUND, OrderMoneyMovement.Channel.MONO, amountMinor,
                OrderMoneyMovement.Source.AUTO, null, "возврат на карту (monobank)", invoiceExtId);
        order.setRefundedMinor(Math.max(0, order.getRefundedMinor()) + amountMinor);
        Order saved = orderRepository.save(order);
        events.publishEvent(OrderEvents.Edited.silent(saved.getId()));
        return saved;
    }
}
