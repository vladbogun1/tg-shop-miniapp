package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.OrderEvents;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.tx.DomainEvents;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;


/**
 * Orders are never deleted: the main admin archives a closed one (DELIVERED / REJECTED) and brings it back.
 * It leaves the board, the lists and the customer's history, and keeps everything: items, chat, payments,
 * receipts, money journal. Replaces the hard delete (25.10.2026: 49 orders were deleted for good, payment
 * records went with them). Stock and promo usage are not touched: archiving changes visibility, not history.
 */
@Service
public class OrderArchive {

    public static final String ARCHIVE_ONLINE_IN_FLIGHT =
            "По заказу есть онлайн-платёж, который банк ещё обрабатывает — дождитесь итога в блоке «Онлайн-оплата»";

    private final OrderOps ops;
    private final OrderRepository orderRepository;
    private final DomainEvents events;
    private final OrderOnlinePayments payments;

    OrderArchive(OrderOps ops, OrderRepository orderRepository, DomainEvents events,
                 OrderOnlinePayments payments) {
        this.ops = ops;
        this.orderRepository = orderRepository;
        this.events = events;
        this.payments = payments;
    }

    /** The main admin only (checked by the controller). */
    @Transactional
    public Order archive(byte[] orderId, String reason, String adminName) {
        Order order = ops.lock(orderId);
        if (order.getArchivedAt() != null) {
            throw OrderErrors.badRequest("заказ уже в архиве");
        }
        if (Order.RETURN_IN_TRANSIT.equals(order.getReturnStatus())) {
            throw OrderErrors.badRequest("посылка ещё едет назад — сначала отметьте «Посылка вернулась»");
        }
        OrderStatus status = order.getStatus();
        if (status != OrderStatus.DELIVERED && status != OrderStatus.REJECTED) {
            throw OrderErrors.badRequest(
                    "в архив можно убрать только доставленный или отклонённый заказ — сначала отклоните его");
        }
        String why = reason == null ? "" : reason.trim();
        if (why.length() < 3) {
            throw OrderErrors.badRequest("напишите, почему заказ убирается в архив");
        }
        if (why.length() > 500) {
            throw OrderErrors.badRequest("причина длиннее 500 символов");
        }
        requireNoOnlineMoneyInFlight(orderId);
        order.archive(ops.now(), adminName, why);
        Order saved = orderRepository.save(order);
        events.publish(OrderEvents.Edited.silent(saved.getId()));
        return saved;
    }

    /** Back from the archive, as it was. */
    @Transactional
    public Order unarchive(byte[] orderId) {
        Order order = ops.lock(orderId);
        if (order.getArchivedAt() == null) {
            throw OrderErrors.badRequest("заказ не в архиве");
        }
        order.unarchive();
        Order saved = orderRepository.save(order);
        events.publish(OrderEvents.Edited.silent(saved.getId()));
        return saved;
    }

    /**
     * A payment the bank is still processing must land on a visible order: an archived one would
     * hide the money from everybody who looks at the board.
     */
    private void requireNoOnlineMoneyInFlight(byte[] orderId) {
        if (payments.hasPaymentInFlight(orderId)) {
            throw OrderErrors.badRequest(ARCHIVE_ONLINE_IN_FLIGHT, "ORDER_PAYMENT_IN_FLIGHT");
        }
    }
}
