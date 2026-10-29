package com.maxsolch.shop.returns.api;

import com.maxsolch.shop.order.app.OrderDetailDto;
import com.maxsolch.shop.order.app.AdminOrderQueries;
import com.maxsolch.shop.order.app.OrderChange;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.order.app.OrderQueryService;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.order.app.OrderOnlinePayments;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.error.BadRequestException;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.returns.app.AdminReturns;
import com.maxsolch.shop.returns.app.Returns;
import com.maxsolch.shop.returns.domain.LineOutcome;
import com.maxsolch.shop.returns.domain.ReturnPlan;
import com.maxsolch.shop.returns.domain.WizardLine;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Characterisation of the return wizard endpoint (moved from AdminOrderControllerTest): the contract is the
 * HTTP-level result — what is returned, thrown and written to the audit — not where the code lives.
 */
@ExtendWith(MockitoExtension.class)
class AdminReturnControllerTest {

    @Mock
    OrderRepository orders;
    @Mock
    OrderQueryService queries;
    @Mock
    OrderLookup lookup;
    @Mock
    AdminAuditService audit;
    @Mock
    Returns returns;
    @Mock
    OrderOnlinePayments payments;

    Order order;
    String id;
    OrderDetailDto detail;

    @BeforeEach
    void setUp() {
        order = new Order();
        order.setId(UuidUtil.randomBytes());
        order.setTotalMinor(10_000);
        id = UuidUtil.toString(order.getId());
        detail = mock(OrderDetailDto.class);
        lenient().when(orders.findById(any())).thenReturn(Optional.of(order));
        lenient().when(queries.toDetail(any(Order.class))).thenReturn(detail);
        lenient().when(audit.currentAdminName()).thenReturn("Иван");
    }

    AdminReturnController controller() {
        AdminOrderQueries adminQueries = new AdminOrderQueries(orders, queries, java.time.Clock.systemUTC(), com.maxsolch.shop.platform.time.ShopZone.of(null));
        AdminReturns adminReturns = new AdminReturns(adminQueries, lookup, returns, null, null, null, payments, audit, null);
        return new AdminReturnController(adminReturns, queries);
    }

    // ------------------------------------------------------------------ return wizard

    private static ReturnDtos.ReturnWizardRequest wizard(List<ReturnDtos.ReturnWizardRequest.WizardLine> lines,
                                              List<ReturnDtos.ReturnWizardRequest.Refund> refunds, Long mono, Long retain) {
        return new ReturnDtos.ReturnWizardRequest(lines, refunds, mono, retain, "note", null);
    }

    @Test
    void wizard_unknownOrder_isNotFound() {
        when(orders.findById(any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller().returnWizard(id, wizard(null, null, null, null)))
                .isInstanceOf(DomainException.NotFound.class);
        verifyNoInteractions(returns, payments, audit);
    }

    @Test
    void wizard_badOutcome_isBadRequest_andNothingRuns() {
        var req = wizard(List.of(new ReturnDtos.ReturnWizardRequest.WizardLine(1, 1, "melted")), null, null, null);

        assertThatThrownBy(() -> controller().returnWizard(id, req))
                .isInstanceOf(DomainException.BadRequest.class).hasMessage("неизвестное состояние товара: melted");
        verifyNoInteractions(returns, payments, audit);
    }

    @Test
    void wizard_manualOnly_checksThenSaves_auditsAndReturnsFreshOrder() {
        var req = wizard(List.of(new ReturnDtos.ReturnWizardRequest.WizardLine(5, 2, null)),
                List.of(new ReturnDtos.ReturnWizardRequest.Refund("CASH", 0, null),
                        new ReturnDtos.ReturnWizardRequest.Refund("CARD_TRANSFER", 4_000, "n")),
                null, 300L);
        Order fresh = new Order();
        fresh.setId(order.getId());
        when(returns.registerPlan(any(byte[].class), any(), any(), anyBoolean()))
                .thenReturn(new OrderChange(order, "возврат: 1"));
        when(lookup.get(order.getId())).thenReturn(fresh);
        when(queries.toDetail(fresh)).thenReturn(detail);

        OrderDetailDto result = controller().returnWizard(id, req);

        assertThat(result).isSameAs(detail);
        ArgumentCaptor<ReturnPlan> plan = ArgumentCaptor.forClass(ReturnPlan.class);
        InOrder in = inOrder(returns, audit);
        in.verify(returns).checkPlan(eq(order.getId()), plan.capture());
        in.verify(returns).registerPlan(eq(order.getId()), eq(plan.getValue()), eq("Иван"), eq(false));
        in.verify(audit).record("ORDER_RETURN", "ORDER", id, "возврат: 1");
        assertThat(plan.getValue().lines()).containsExactly(
                new WizardLine(5, 2, LineOutcome.RESTOCK));
        assertThat(plan.getValue().refunds()).hasSize(1);
        assertThat(plan.getValue().refunds().get(0).amountMinor()).isEqualTo(4_000);
        assertThat(plan.getValue().retainMinor()).isEqualTo(300);
        assertThat(plan.getValue().monoRefundMinor()).isZero();
        assertThat(plan.getValue().notifyCustomer()).isTrue();
        verifyNoInteractions(payments);
    }

    @Test
    void wizard_withMonobank_checkBankAuditBooks_inThatOrder() {
        var req = wizard(List.of(), List.of(), 2_500L, null);
        when(payments.refundableInvoice(order.getId(), 2_500)).thenReturn("inv-1");
        when(returns.registerPlan(any(byte[].class), any(), any(), anyBoolean()))
                .thenReturn(new OrderChange(order, "d"));
        when(lookup.get(order.getId())).thenReturn(order);

        controller().returnWizard(id, req);

        InOrder in = inOrder(returns, payments, audit);
        in.verify(returns).checkPlan(eq(order.getId()), any());
        in.verify(payments).refundableInvoice(order.getId(), 2_500);
        in.verify(payments).refund(order.getId(), "inv-1", 2_500L);
        in.verify(audit).record("ORDER_REFUND_ONLINE", "ORDER", id,
                "возврат на карту через monobank 25 ₴ (мастер возврата)");
        in.verify(returns).registerPlan(eq(order.getId()), any(), eq("Иван"), eq(true));
        in.verify(audit).record("ORDER_RETURN", "ORDER", id, "d");
    }

    @Test
    void wizard_bankRefuses_nothingSaved_codeKept_lockReleased() {
        var req = wizard(List.of(), List.of(), 2_500L, null);
        when(payments.refundableInvoice(any(byte[].class), anyLong())).thenReturn("inv-1");
        org.mockito.Mockito.doThrow(new BadRequestException("нет денег")).when(payments)
                .refund(any(byte[].class), anyString(), anyLong());

        assertThatThrownBy(() -> controller().returnWizard(id, req))
                .isInstanceOfSatisfying(DomainException.BadRequest.class, e -> {
                    assertThat(e.getMessage()).isEqualTo(
                            "monobank не принял возврат денег: нет денег. Ничего не сохранено — исправьте и повторите.");
                    assertThat(e.getCode()).isEqualTo("MONO_REFUND_FAILED");
                });
        verify(returns, never()).registerPlan(any(byte[].class), any(), any(), anyBoolean());
        verify(audit, never()).record(anyString(), anyString(), any(), anyString());
    }

    @Test
    void wizard_refusedPlan_sendsNoMoney_andReleasesTheLock() {
        var req = wizard(List.of(), List.of(), 2_500L, null);
        AdminReturnController c = controller();
        org.mockito.Mockito.doThrow(new BadRequestException("план плох")).doNothing()
                .when(returns).checkPlan(any(byte[].class), any());

        assertThatThrownBy(() -> c.returnWizard(id, req)).hasMessage("план плох");
        verifyNoInteractions(payments);
        verify(audit, never()).record(anyString(), anyString(), any(), anyString());

        // the lock was released: the same order can be tried again
        when(payments.refundableInvoice(any(byte[].class), anyLong())).thenReturn("inv");
        when(returns.registerPlan(any(byte[].class), any(), any(), anyBoolean()))
                .thenReturn(new OrderChange(order, "ok"));
        when(lookup.get(any(byte[].class))).thenReturn(order);
        c.returnWizard(id, req);
        verify(returns).registerPlan(any(byte[].class), any(), any(), eq(true));
    }

    @Test
    void wizard_secondSubmitWhileFirstRuns_isRejected_thenFreeAgain() {
        var req = wizard(List.of(), List.of(), null, null);
        AdminReturnController c = controller();
        org.mockito.Mockito.doAnswer(inv -> {
            assertThatThrownBy(() -> c.returnWizard(id, req))
                    .isInstanceOf(DomainException.BadRequest.class)
                    .hasMessage("возврат по этому заказу уже оформляется — дождитесь окончания");
            return null;
        }).when(returns).checkPlan(any(byte[].class), any());
        when(returns.registerPlan(any(byte[].class), any(), any(), anyBoolean()))
                .thenReturn(new OrderChange(order, "ok"));
        when(lookup.get(any(byte[].class))).thenReturn(order);

        c.returnWizard(id, req);

        verify(returns, times(1)).registerPlan(any(byte[].class), any(), any(), anyBoolean());
        c.returnWizard(id, req); // lock released after the first run
        verify(returns, times(2)).registerPlan(any(byte[].class), any(), any(), anyBoolean());
    }

    @Test
    void wizard_lockIsPerOrder() {
        var req = wizard(List.of(), List.of(), null, null);
        Order other = new Order();
        other.setId(UuidUtil.randomBytes());
        String otherId = UuidUtil.toString(other.getId());
        when(orders.findById(other.getId())).thenReturn(Optional.of(other));
        AdminReturnController c = controller();
        org.mockito.Mockito.doAnswer(inv -> {
            if (java.util.Arrays.equals(inv.getArgument(0, byte[].class), order.getId())) {
                c.returnWizard(otherId, req); // a different order is not blocked
            }
            return null;
        }).when(returns).checkPlan(any(byte[].class), any());
        when(returns.registerPlan(any(byte[].class), any(), any(), anyBoolean()))
                .thenReturn(new OrderChange(order, "ok"));
        when(lookup.get(any(byte[].class))).thenReturn(order);

        c.returnWizard(id, req);

        verify(returns, times(2)).registerPlan(any(byte[].class), any(), any(), anyBoolean());
    }
}
