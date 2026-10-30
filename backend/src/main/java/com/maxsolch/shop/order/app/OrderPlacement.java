package com.maxsolch.shop.order.app;

import com.maxsolch.shop.customer.domain.User;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderSource;
import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.customer.app.Customers;
import org.springframework.stereotype.Service;

import static com.maxsolch.shop.platform.util.Texts.trimToNull;

/**
 * The customer's checkout button: a retried request returns the order already placed, the anti-bot limits are
 * checked, the buyer's Telegram name is snapshotted, the order is created and «Журнал → Бот и сайт» gets a line
 * for the order or the refusal.
 *
 * <p>Not {@code @Transactional}: {@link Checkout#createOrder} is the transaction; the journal entry is written
 * after it has committed (or failed).
 */
@Service
public class OrderPlacement {

    /** The order the customer gets back: its id and what is still to pay. */
    public record Placed(String orderId, long amountDueMinor) {
    }

    private final Checkout checkout;
    private final OrderLookup orderLookup;
    private final Customers userRepository;
    private final OrderIdempotencyService idempotency;
    private final OrderGuard orderGuard;
    private final ActivityLog activity;

    public OrderPlacement(Checkout checkout, OrderLookup orderLookup, Customers userRepository,
                          OrderIdempotencyService idempotency, OrderGuard orderGuard, ActivityLog activity) {
        this.checkout = checkout;
        this.orderLookup = orderLookup;
        this.userRepository = userRepository;
        this.idempotency = idempotency;
        this.orderGuard = orderGuard;
        this.activity = activity;
    }

    /**
     * @param draft the request as a command; its {@code tgUsername} and {@code source} are filled in here
     * @param web   the customer came from the website (a site token), not from the Mini App
     */
    public Placed place(long userId, boolean web, String idempotencyKey, CreateOrderCommand draft) {
        // A retried checkout (lost response, double tap) must not become a second order with a
        // second stock deduction — return the one already created under this key.
        String existingOrderId = idempotency.previousOrderId(userId, idempotencyKey);
        if (existingOrderId != null) {
            return new Placed(existingOrderId,
                    OrderMoney.amountDueMinor(orderLookup.get(UuidUtil.toBytes(existingOrderId))));
        }

        Order order;
        try {
            order = create(userId, web, draft);
        } catch (RuntimeException e) {
            activity.record(activity.fromRequest("ORDER_FAILED")
                    .text("Заказ не оформлен: " + e.getMessage())
                    .detail("items", draft.items().size())
                    .detail("promoCode", trimToNull(draft.promoCode()))
                    .rejected(e));
            throw e;
        }
        String orderId = UuidUtil.toString(order.getId());
        idempotency.remember(userId, idempotencyKey, orderId);
        activity.record(activity.fromRequest("ORDER_CREATED")
                .order(order.getId())
                .text("Заказ #" + orderId.substring(0, 8) + " на " + MoneyFormat.amount(order.getTotalMinor())
                        + " " + order.getCurrency()
                        + (order.getPromoCode() != null ? " · промокод " + order.getPromoCode() : ""))
                .detail("totalMinor", order.getTotalMinor())
                .detail("discountMinor", order.getDiscountMinor() > 0 ? order.getDiscountMinor() : null)
                .detail("promoCode", order.getPromoCode())
                .detail("items", order.getItems().size())
                .detail("payment", order.getPaymentOptionTitle())
                .detail("delivery", order.getDeliveryMethod()));
        // Next step for the app: POST /api/me/orders/{id}/payment → monobank payment page.
        return new Placed(orderId, OrderMoney.amountDueMinor(order));
    }

    private Order create(long userId, boolean web, CreateOrderCommand draft) {
        // Anti-bot / anti-hoarding limits (settings «Защита от ботов и спама»): 400/429 with a code.
        orderGuard.check(userId, draft.items());

        // Snapshot the customer's Telegram @username (from the users row, populated at auth)
        // so the admin order card can deep-link to their Telegram DM.
        String tgUsername = userRepository.findById(userId).map(User::getUsername).orElse(null);
        return checkout.createOrder(new CreateOrderCommand(
                draft.userId(), draft.tgUserId(), tgUsername, draft.items(),
                draft.customerName(), draft.phone(), draft.comment(), draft.promoCode(), draft.deliveryMethod(),
                draft.npCityRef(), draft.npCityName(), draft.npWarehouseRef(), draft.npWarehouseName(),
                draft.paymentOptionId(),
                // A site token (cookie, chn=web) marks the order as placed on the website.
                web ? OrderSource.WEB : OrderSource.MINIAPP,
                draft.giftChoice()));
    }
}
