package com.maxsolch.shop.returns.app;

import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.order.app.MoneyLedger;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.returns.domain.LineOutcome;
import com.maxsolch.shop.returns.domain.ManualRefund;
import com.maxsolch.shop.returns.domain.WizardLine;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Cancelling the newest return (V70): units back into the order, money back / debt / kept, the cancel blocker. */
class ReturnCancellationTest extends ReturnsTestBase {

    @Test
    void cancelReturn_restockedUnitsLeaveTheShelf_andTheMoneyComesBack() {
        Order o = order(OrderStatus.DELIVERED);
        OrderFixtures.set(o, "receivedMinor", 30_000);
        OrderFixtures.set(o, "paid", true);
        Product p = product(3);
        OrderItem it = item(o, p, 1L, 2);
        when(productRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));
        MoneyLedger ledger = wireLedger();
        List<com.maxsolch.shop.returns.domain.OrderReturn> recs = new ArrayList<>();
        wireReturnRecords(recs);

        returns.registerPlan(o.getId(), plan(
                List.of(new WizardLine(1L, 2, LineOutcome.RESTOCK)),
                List.of(new ManualRefund(
                        com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.CARD_TRANSFER, 20_000, null)),
                0, 0), "owner");
        assertThat(p.getStock()).isEqualTo(5);
        assertThat(o.getRefundedMinor()).isEqualTo(20_000);
        assertThat(recs).hasSize(1);

        assertThatThrownBy(() -> cancellation.cancel(o.getId(), recs.get(0).getId(),
                ReturnCancellation.CancelMoney.RETURNED, "", "owner"))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> cancellation.cancel(o.getId(), recs.get(0).getId(), null, "передумал", "owner"))
                .isInstanceOf(DomainException.BadRequest.class); // money was given — the choice is required

        cancellation.cancel(o.getId(), recs.get(0).getId(), ReturnCancellation.CancelMoney.RETURNED,
                "передумал", "owner");

        assertThat(p.getStock()).isEqualTo(3);
        assertThat(it.getReturnedQty()).isZero();
        assertThat(it.getRestockedQty()).isZero();
        assertThat(o.getRefundedMinor()).isZero();
        assertThat(recs.get(0).getCancelledAt()).isNotNull();
        assertThat(recs.get(0).getCancelNote()).isEqualTo("передумал");
        verify(ledger).record(eq(o.getId()), eq(com.maxsolch.shop.order.domain.OrderMoneyMovement.Kind.REFUND),
                eq(com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.CARD_TRANSFER), eq(-20_000L), any(),
                any(), any(), any());
        assertThatThrownBy(() -> cancellation.cancel(o.getId(), recs.get(0).getId(),
                ReturnCancellation.CancelMoney.RETURNED, "ещё раз", "owner"))
                .isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void cancelReturn_unitAlreadySoldAgain_isRefused_andDebtIsRecordedOtherwise() {
        Order o = order(OrderStatus.DELIVERED);
        OrderFixtures.set(o, "receivedMinor", 30_000);
        OrderFixtures.set(o, "paid", true);
        Product p = product(0);
        item(o, p, 1L, 1);
        when(productRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));
        wireLedger();
        List<com.maxsolch.shop.returns.domain.OrderReturn> recs = new ArrayList<>();
        wireReturnRecords(recs);
        returns.registerPlan(o.getId(), plan(
                List.of(new WizardLine(1L, 1, LineOutcome.RESTOCK)),
                List.of(new ManualRefund(
                        com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.CARD_TRANSFER, 10_000, null)),
                0, 0), "owner");
        p.setStock(0); // sold to someone else meanwhile

        assertThatThrownBy(() -> cancellation.cancel(o.getId(), recs.get(0).getId(),
                ReturnCancellation.CancelMoney.DEBT, "передумал", "owner"))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("уже продали");

        p.setStock(1);
        cancellation.cancel(o.getId(), recs.get(0).getId(), ReturnCancellation.CancelMoney.DEBT,
                "передумал", "owner");
        assertThat(recs.get(0).getDebtMinor()).isEqualTo(10_000);
        assertThat(o.getRefundedMinor()).isEqualTo(10_000); // nothing came back yet

        cancellation.settleDebt(o.getId(), recs.get(0).getId(), "owner");
        assertThat(recs.get(0).getDebtPaidAt()).isNotNull();
        assertThat(o.getRefundedMinor()).isZero();
    }

    @Test
    void cancelBlocker_saysWhyTheNewestRecordCannotBeUndone() {
        com.maxsolch.shop.returns.domain.OrderReturn plain = new com.maxsolch.shop.returns.domain.OrderReturn();
        com.maxsolch.shop.returns.domain.OrderReturn exchange = new com.maxsolch.shop.returns.domain.OrderReturn();
        OrderFixtures.set(exchange, "kind", com.maxsolch.shop.returns.domain.OrderReturn.Kind.EXCHANGE.name());
        OrderFixtures.set(exchange, "refundMinor", 10_000);
        com.maxsolch.shop.returns.domain.OrderReturn done = new com.maxsolch.shop.returns.domain.OrderReturn();
        OrderFixtures.set(done, "cancelledAt", java.time.Instant.now());

        assertThat(done.cancelBlocker(null)).isEqualTo("уже отменён");
        assertThat(plain.cancelBlocker(order(OrderStatus.DELIVERED))).isNull();
        assertThat(exchange.cancelBlocker(null)).isNull();

        Order shipped = order(OrderStatus.SHIPPED);
        assertThat(exchange.cancelBlocker(shipped)).contains("уже отправили");
        Order delivered = order(OrderStatus.DELIVERED);
        assertThat(exchange.cancelBlocker(delivered)).contains("уже отправили");

        Order paidMore = order(OrderStatus.NEW);
        OrderFixtures.set(paidMore, "receivedMinor", 30_000);
        assertThat(exchange.cancelBlocker(paidMore)).contains("уже доплатили 200 ₴");
        Order onlyCredit = order(OrderStatus.NEW);
        OrderFixtures.set(onlyCredit, "receivedMinor", 10_000);
        assertThat(exchange.cancelBlocker(onlyCredit)).isNull();
    }

    @Test
    void cancelReturn_onlyTheNewestRecord_andNotWithoutAReason() {
        Order o = order(OrderStatus.DELIVERED);
        OrderFixtures.set(o, "receivedMinor", 30_000);
        OrderFixtures.set(o, "paid", true);
        Product p = product(0);
        item(o, p, 1L, 2);
        when(productRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));
        List<com.maxsolch.shop.returns.domain.OrderReturn> recs = new ArrayList<>();
        wireReturnRecords(recs);
        for (int i = 0; i < 2; i++) {
            returns.registerPlan(o.getId(), plan(
                    List.of(new WizardLine(1L, 1, LineOutcome.RESTOCK)),
                    List.of(), 0, 0), "owner");
        }
        assertThat(recs).hasSize(2);

        assertThatThrownBy(() -> cancellation.cancel(o.getId(), recs.get(0).getId(), null, "передумал", "owner"))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("только последний");
        assertThatThrownBy(() -> cancellation.cancel(o.getId(), recs.get(1).getId(), null, "  ", "owner"))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> cancellation.cancel(o.getId(), 999L, null, "передумал", "owner"))
                .isInstanceOf(DomainException.NotFound.class);
    }

}
