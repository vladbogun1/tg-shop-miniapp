package com.maxsolch.shop.order.app;

import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.gift.GiftService;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.domain.RejectCause;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.inventory.app.OrderStock;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;

/**
 * The few things every order scenario ({@link Checkout}, {@link OrderLifecycle}, {@link OrderEditing}, ...)
 * does the same way: load the order under a row lock, write to the money journal, persist a status change and
 * hand the Telegram side to the after-commit listener, recompute the totals, read ids and the clock.
 * Package-private: other modules use the scenarios, not this.
 */
@Component
class OrderOps {

    private final OrderRepository orderRepository;
    private final EntityManager entityManager;
    private final MoneyLedger moneyLedger;
    private final GiftService giftService;
    private final ApplicationEventPublisher events;
    private final Messages messages;
    private final Clock clock;

    OrderOps(OrderRepository orderRepository, EntityManager entityManager, MoneyLedger moneyLedger,
             GiftService giftService, ApplicationEventPublisher events, Messages messages, Clock clock) {
        this.orderRepository = orderRepository;
        this.entityManager = entityManager;
        this.moneyLedger = moneyLedger;
        this.giftService = giftService;
        this.events = events;
        this.messages = messages;
        this.clock = clock;
    }

    Instant now() {
        return clock.instant();
    }

    /**
     * Loads the order under a row lock (SELECT ... FOR UPDATE) and refreshes it, so concurrent admin / customer
     * actions on one order run one after another.
     *
     * <p>The refresh matters: with open-in-view the request's persistence context usually already holds this
     * order (the controller loaded it to check access/existence), and a locking query then hands back that
     * cached instance untouched. Two concurrent rejects would both still see {@code NEW} after waiting for each
     * other's lock, and both return the stock. Refreshing with the lock re-reads the committed row.
     */
    Order lock(byte[] orderId) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> OrderErrors.notFound("order not found"));
        entityManager.refresh(order, LockModeType.PESSIMISTIC_WRITE);
        return order;
    }

    /** One line of the order money journal; a zero amount is not a movement. */
    void ledger(Order order, OrderMoneyMovement.Kind kind, OrderMoneyMovement.Channel channel, long amountMinor,
                OrderMoneyMovement.Source source, String adminName, String note, String invoiceExtId) {
        if (amountMinor != 0) {
            moneyLedger.record(order.getId(), kind, channel, amountMinor, source, adminName, note, invoiceExtId);
        }
    }

    /**
     * Persists a status transition and hands the Telegram side to the after-commit listener: it moves the
     * channel card, DMs the customer, and adds or removes the seller's dispatch card depending on whether the
     * order still awaits shipment.
     */
    Order afterTransition(Order order) {
        if (order.getStatus() == OrderStatus.REJECTED) {
            // An unused code from the case (a discount prize, a swap) goes with the order.
            giftService.revokeCasePromo(order.getId());
        }
        Order saved = orderRepository.save(order);
        events.publishEvent(new OrderEvents.StatusChanged(saved.getId()));
        return saved;
    }

    /** The common tail of every reject, under the order lock: the status moves, then {@link #afterTransition}. */
    Order reject(Order order, RejectCause cause) {
        order.reject(cause);
        return afterTransition(order);
    }

    /** Recompute subtotal from items; keep the stored (absolute) discount capped at subtotal. */
    void recomputeTotals(Order order) {
        OrderMoney.reprice(order);
        order.settleIfFree(now());
    }

    byte[] toBytes(String uuid, String field) {
        try {
            return UuidUtil.toBytes(uuid);
        } catch (IllegalArgumentException e) {
            throw OrderErrors.badRequest(messages.current("api.order.fieldInvalid", fieldLabel(field)));
        }
    }

    /** The customer-facing name of a checkout field ("phone" becomes "телефон"); ids stay as they are. */
    String fieldLabel(String field) {
        return switch (field) {
            case "customerName", "phone" -> messages.current("api.order.field." + field);
            default -> field;
        };
    }

    ProductVariant findVariant(Product product, String variantId) {
        return OrderStock.variantOf(product, toBytes(variantId, "variantId"));
    }
}
