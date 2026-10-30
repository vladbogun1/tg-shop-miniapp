package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.infra.OrderRepository;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Objects;

/**
 * Sync the seller "К ОТПРАВКЕ" topic with the current APPROVED orders. For each order we
 * reconcile its card with Telegram: missing cards are posted, manually-deleted cards are
 * re-posted, and existing cards are refreshed in place. Idempotent: pressing the button
 * repeatedly never creates duplicates.
 *
 * <p>Deliberately NOT one transaction: that held a database connection (and the transaction)
 * open across one Bot API round trip per approved order. The orders are read with their items
 * up front, Telegram is called with no transaction open, and each changed card id is written
 * back on its own in a short update.
 */
@Component
public class OrderDispatchNotifier {

    private final OrderRepository orderRepository;
    private final EntityManager entityManager;
    private final OrderSellerNotifier seller;
    private final TransactionTemplate tx;

    OrderDispatchNotifier(OrderRepository orderRepository, EntityManager entityManager,
                          OrderSellerNotifier seller, TransactionTemplate tx) {
        this.orderRepository = orderRepository;
        this.entityManager = entityManager;
        this.seller = seller;
        this.tx = tx;
    }

    /** @return how many cards were (re)posted */
    public int broadcastDispatch() {
        List<Order> approved = orderRepository.findWithItemsByStatus(OrderStatus.APPROVED);
        int posted = 0;
        for (Order o : approved) {
            // Detached: open-in-view keeps these managed, and the card id set by Telegram sync
            // would then be flushed as a full-row UPDATE of a possibly stale order (undoing, say,
            // a status change made meanwhile). Only the targeted update below writes it.
            entityManager.detach(o);
            Integer before = o.getDispatchMessageId();
            if (seller.syncDispatchCard(o)) {
                posted++;
            }
            if (!Objects.equals(before, o.getDispatchMessageId())) {
                tx.executeWithoutResult(s ->
                        orderRepository.updateDispatchMessageId(o.getId(), o.getDispatchMessageId()));
            }
        }
        return posted;
    }
}
