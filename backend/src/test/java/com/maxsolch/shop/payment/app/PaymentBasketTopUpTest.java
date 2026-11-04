package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderStates;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.payment.domain.MonobankGateway;
import com.maxsolch.shop.payment.domain.PaymentInvoice;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** The receipt of a top-up names what was added, not «Оплата замовлення» (order #d097e8b4, 04.11.2026). */
class PaymentBasketTopUpTest {

    private static final byte[] GLIDES = UuidUtil.randomBytes();
    private static final byte[] FAN = UuidUtil.randomBytes();

    private static OrderItem line(byte[] product, String title, long price, int qty) {
        OrderItem it = new OrderItem();
        OrderFixtures.set(it, "productId", product);
        OrderFixtures.set(it, "titleSnapshot", title);
        OrderFixtures.set(it, "priceMinorSnapshot", price);
        OrderFixtures.set(it, "quantity", qty);
        return it;
    }

    private static Order order(int glides, long received) {
        Order o = new Order();
        OrderFixtures.set(o, "id", UuidUtil.randomBytes());
        OrderStates.withStatus(o, OrderStatus.APPROVED);
        OrderFixtures.set(o, "items", new ArrayList<>(List.of(
                line(GLIDES, "Глайди", 150_00, glides), line(FAN, "Дуйка", 900_00, 1))));
        long total = 150_00L * glides + 900_00;
        OrderFixtures.set(o, "subtotalMinor", total);
        OrderFixtures.set(o, "totalMinor", total);
        OrderFixtures.set(o, "receivedMinor", received);
        OrderFixtures.set(o, "paid", received > 0);
        return o;
    }

    /** The applied first invoice: the basket of the order as it was paid. */
    private static PaymentInvoice paid(Order asPaid) {
        PaymentInvoice inv = new PaymentInvoice();
        OrderFixtures.set(inv, "appliedAt", Instant.parse("2026-11-04T07:44:57Z"));
        OrderFixtures.set(inv, "basketJson",
                PaymentBasket.toJson(PaymentBasket.of(asPaid, asPaid.getTotalMinor(), "d097e8b4")));
        return inv;
    }

    @Test
    void topUp_isItemisedWithTheAddedUnits() {
        PaymentInvoice first = paid(order(1, 0));
        Order grown = order(3, 1050_00);

        List<MonobankGateway.BasketItem> basket =
                PaymentBasket.of(grown, 300_00, "d097e8b4", List.of(2), List.of(first));

        assertThat(basket).singleElement().satisfies(b -> {
            assertThat(b.name()).isEqualTo("Глайди");
            assertThat(b.qty()).isEqualTo(2);
            assertThat(b.sum()).isEqualTo(150_00);
            assertThat(b.tax()).containsExactly(2);
        });
    }

    @Test
    void topUp_thatDoesNotAddUp_isOneLineNamedAsATopUp() {
        PaymentInvoice first = paid(order(1, 0));
        Order grown = order(2, 1050_00);

        List<MonobankGateway.BasketItem> basket =
                PaymentBasket.of(grown, 100_00, "d097e8b4", List.of(), List.of(first)); // a discount came in between

        assertThat(basket).singleElement().satisfies(b -> {
            assertThat(b.name()).isEqualTo("Доплата за замовлення #d097e8b4");
            assertThat(b.sum()).isEqualTo(100_00);
        });
    }

    @Test
    void notAppliedInvoices_doNotCountAsPaid() {
        PaymentInvoice expired = paid(order(1, 0));
        OrderFixtures.set(expired, "appliedAt", null);

        List<MonobankGateway.BasketItem> basket =
                PaymentBasket.of(order(2, 0), 1200_00, "d097e8b4", List.of(), List.of(expired));

        assertThat(basket).extracting(MonobankGateway.BasketItem::qty).containsExactly(2L, 1L);
    }
}
