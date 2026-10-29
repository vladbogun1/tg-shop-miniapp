package com.maxsolch.shop.order.api;

import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.domain.RejectReasonCode;
import com.maxsolch.shop.order.domain.SenderType;
import com.maxsolch.shop.payment.OnlinePaymentService;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.order.app.AdminOrderQueries;
import com.maxsolch.shop.order.app.AdminOrderStatusService;
import com.maxsolch.shop.order.app.OrderAdjustmentService;
import com.maxsolch.shop.order.app.OrderQueryService;
import com.maxsolch.shop.order.app.OrderArchive;
import com.maxsolch.shop.order.app.OrderPayments;
import com.maxsolch.shop.order.app.OrderService;
import com.maxsolch.shop.returns.app.ReturnWizardService;
import com.maxsolch.shop.platform.error.BadRequestException;
import com.maxsolch.shop.platform.error.NotFoundException;
import com.maxsolch.shop.order.api.OrderAdjustmentDtos.ReturnWizardRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.notNull;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

/**
 * Characterisation of the order endpoints that are being thinned out (board, list, status, return
 * wizard): the contract is the HTTP-level result — what is returned, thrown and written to the
 * audit — not where the code lives. Wiring is in {@link #controller()} only.
 */
@ExtendWith(MockitoExtension.class)
class AdminOrderControllerTest {

    @Mock
    OrderRepository orders;
    @Mock
    OrderService orderService;
    @Mock
    OrderPayments orderPayments;
    @Mock
    OrderArchive orderArchive;
    @Mock
    OrderQueryService queries;
    @Mock
    AdminAuditService audit;
    @Mock
    OrderAdjustmentService adjustments;
    @Mock
    OnlinePaymentService payments;

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

    AdminOrderController controller() {
        AdminOrderQueries lookup = new AdminOrderQueries(orders, queries);
        return new AdminOrderController(lookup,
                new AdminOrderStatusService(lookup, orderService, payments, audit),
                new ReturnWizardService(lookup, orderService, adjustments, payments, audit),
                orderService, orderPayments, orderArchive, queries, null, audit, null, null, adjustments, payments);
    }

    private static UpdateOrderStatusRequest status(String s, String tracking, String reason, Boolean restock,
                                                   String code, Boolean shipUnpaid, Boolean inTransit) {
        return new UpdateOrderStatusRequest(s, tracking, reason, restock, code, shipUnpaid, inTransit);
    }

    // ------------------------------------------------------------------ updateStatus

    @Test
    void status_unknown_isBadRequest_beforeAnyLookup() {
        assertThatThrownBy(() -> controller().updateStatus(id, status(" bogus ", null, null, null, null, null, null)))
                .isInstanceOf(BadRequestException.class).hasMessage("неизвестный статус:  bogus ");
        verifyNoInteractions(orders, orderService, audit, payments);
    }

    @Test
    void status_shippedWithoutTracking_isBadRequest() {
        assertThatThrownBy(() -> controller().updateStatus(id, status("SHIPPED", "  ", null, null, null, null, null)))
                .isInstanceOf(BadRequestException.class).hasMessage("укажите номер ТТН");
        verifyNoInteractions(orders, orderService, audit);
    }

    @Test
    void status_rejectedWithoutReason_isBadRequest() {
        assertThatThrownBy(() -> controller().updateStatus(id, status("rejected", null, " ", null, null, null, null)))
                .isInstanceOf(BadRequestException.class).hasMessage("укажите причину отклонения");
        verifyNoInteractions(orders, orderService, audit);
    }

    @Test
    void status_reasonOtherWithoutText_isBadRequest() {
        assertThatThrownBy(() -> controller().updateStatus(id, status("REJECTED", null, null, null, "OTHER", null, null)))
                .isInstanceOf(BadRequestException.class).hasMessage("для причины «Другое» напишите пояснение");
        verifyNoInteractions(orders, orderService, audit);
    }

    @Test
    void status_unknownReasonCode_isBadRequest() {
        assertThatThrownBy(() -> controller().updateStatus(id, status("REJECTED", null, "x", null, "WAT", null, null)))
                .isInstanceOf(BadRequestException.class).hasMessage("неизвестная причина отказа: WAT");
        verifyNoInteractions(orders, orderService, audit);
    }

    @Test
    void status_unknownOrder_isNotFound_andNothingChanges() {
        when(orders.findById(any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller().updateStatus(id, status("APPROVED", null, null, null, null, null, null)))
                .isInstanceOf(NotFoundException.class).hasMessage("заказ не найден");
        verifyNoInteractions(orderService, audit, payments);
    }

    @Test
    void status_garbageId_isNotFound() {
        assertThatThrownBy(() -> controller().updateStatus("nope", status("APPROVED", null, null, null, null, null, null)))
                .isInstanceOf(NotFoundException.class).hasMessage("заказ не найден");
    }

    @Test
    void status_approve_changesStatus_auditsOnce_returnsDetail() {
        Order updated = new Order();
        updated.setId(order.getId());
        when(orderService.changeStatus(eq(order.getId()), eq(OrderStatus.APPROVED), any(), any(), any(),
                anyBoolean(), anyBoolean())).thenReturn(updated);
        when(queries.toDetail(updated)).thenReturn(detail);

        OrderDetailDto result = controller().updateStatus(id, status("approved", null, null, null, null, null, null));

        assertThat(result).isSameAs(detail);
        verify(orderService).changeStatus(order.getId(), OrderStatus.APPROVED, null, null, null, true, false);
        verify(audit).record("ORDER_STATUS", "ORDER", id, "статус → APPROVED");
        verify(audit, times(1)).record(anyString(), anyString(), any(), anyString());
        verifyNoInteractions(payments);
    }

    @Test
    void status_ship_passesTrackingAndShipUnpaid_auditsTracking() {
        Order updated = new Order();
        updated.setId(order.getId());
        when(orderService.changeStatus(any(byte[].class), eq(OrderStatus.SHIPPED), any(), any(), any(),
                anyBoolean(), anyBoolean())).thenReturn(updated);

        controller().updateStatus(id, status("SHIPPED", "5900", null, null, null, true, null));

        verify(orderService).changeStatus(order.getId(), OrderStatus.SHIPPED, "5900", null, null, true, true);
        verify(audit).record("ORDER_STATUS", "ORDER", id, "статус → SHIPPED, ТТН 5900");
        verify(audit, never()).record(eq("ORDER_SHIP_UNPAID"), anyString(), any(), anyString());
    }

    @Test
    void status_shipWithoutOnlineMoney_auditsDecisionBeforeStatusEntry() {
        order.setPaymentDueAt(Instant.now());
        order.setReceivedMinor(2_500);
        Order updated = new Order();
        updated.setId(order.getId());
        when(orderService.changeStatus(any(byte[].class), eq(OrderStatus.SHIPPED), any(), any(), any(),
                anyBoolean(), anyBoolean())).thenReturn(updated);

        controller().updateStatus(id, status("SHIPPED", "5900", null, null, null, true, null));

        InOrder in = inOrder(orderService, audit);
        in.verify(orderService).changeStatus(any(byte[].class), any(), any(), any(), any(), anyBoolean(), anyBoolean());
        in.verify(audit).record("ORDER_SHIP_UNPAID", "ORDER", id,
                "отправлен без онлайн-оплаты (не пришло 75 ₴) по решению админа Иван");
        in.verify(audit).record("ORDER_STATUS", "ORDER", id, "статус → SHIPPED, ТТН 5900");
    }

    @Test
    void status_reject_closesInvoices_andAuditsRestock() {
        Order updated = new Order();
        updated.setId(order.getId());
        when(orderService.changeStatus(any(byte[].class), eq(OrderStatus.REJECTED), any(), any(), any(),
                anyBoolean(), anyBoolean())).thenReturn(updated);

        controller().updateStatus(id, status("REJECTED", null, "не вышел на связь", null, "NO_RESPONSE", null, null));

        verify(orderService).changeStatus(order.getId(), OrderStatus.REJECTED, null, "не вышел на связь",
                RejectReasonCode.NO_RESPONSE, true, false);
        InOrder in = inOrder(payments, audit);
        in.verify(payments).closeOpenInvoices(order.getId());
        in.verify(audit).record("ORDER_STATUS", "ORDER", id,
                "статус → REJECTED, код причины NO_RESPONSE, причина: не вышел на связь, сток возвращён");
    }

    @Test
    void status_rejectWithoutRestock_auditsIt() {
        Order updated = new Order();
        updated.setId(order.getId());
        when(orderService.changeStatus(any(byte[].class), eq(OrderStatus.REJECTED), any(), any(), any(),
                anyBoolean(), anyBoolean())).thenReturn(updated);

        controller().updateStatus(id, status("REJECTED", null, "брак", false, null, null, null));

        verify(audit).record("ORDER_STATUS", "ORDER", id, "статус → REJECTED, причина: брак, БЕЗ возврата стока");
    }

    @Test
    void status_rejectInTransit_goesThroughReject_andAuditsTheTrip() {
        Order updated = new Order();
        updated.setId(order.getId());
        updated.setReturnStatus(Order.RETURN_IN_TRANSIT);
        when(orderService.reject(any(byte[].class), any(), any(), anyBoolean(), anyBoolean())).thenReturn(updated);

        controller().updateStatus(id, status("REJECTED", null, "отказ на почте", null, "REFUSED_AT_POST", null, true));

        verify(orderService).reject(order.getId(), "отказ на почте", RejectReasonCode.REFUSED_AT_POST, true, true);
        verify(orderService, never()).changeStatus(any(byte[].class), any(), any(), any(), any(), anyBoolean(), anyBoolean());
        verify(payments).closeOpenInvoices(order.getId());
        verify(audit).record("ORDER_STATUS", "ORDER", id,
                "статус → REJECTED, код причины REFUSED_AT_POST, причина: отказ на почте, "
                        + "посылка едет назад (сток — по приходу)");
    }

    @Test
    void status_returnInTransit_ignoredForNonReject() {
        Order updated = new Order();
        updated.setId(order.getId());
        when(orderService.changeStatus(any(byte[].class), eq(OrderStatus.DELIVERED), any(), any(), any(),
                anyBoolean(), anyBoolean())).thenReturn(updated);

        controller().updateStatus(id, status("DELIVERED", null, null, null, null, null, true));

        verify(orderService, never()).reject(any(byte[].class), any(), any(), anyBoolean(), anyBoolean());
        verify(orderService).changeStatus(order.getId(), OrderStatus.DELIVERED, null, null, null, true, false);
    }

    @Test
    void status_serviceFails_noAudit_noInvoiceClosing() {
        when(orderService.changeStatus(any(byte[].class), any(), any(), any(), any(), anyBoolean(), anyBoolean()))
                .thenThrow(new BadRequestException("нельзя"));

        assertThatThrownBy(() -> controller().updateStatus(id, status("REJECTED", null, "x", null, null, null, null)))
                .isInstanceOf(BadRequestException.class).hasMessage("нельзя");
        verifyNoInteractions(audit, payments);
    }

    @Test
    void status_invoiceClosingFails_exceptionPropagates_andNothingIsAudited() {
        Order updated = new Order();
        updated.setId(order.getId());
        when(orderService.changeStatus(any(byte[].class), any(), any(), any(), any(), anyBoolean(), anyBoolean()))
                .thenReturn(updated);
        org.mockito.Mockito.doThrow(new IllegalStateException("mono down")).when(payments).closeOpenInvoices(any());

        assertThatThrownBy(() -> controller().updateStatus(id, status("REJECTED", null, "x", null, null, null, null)))
                .isInstanceOf(IllegalStateException.class);
        verify(audit, never()).record(anyString(), anyString(), any(), anyString());
    }

    // ------------------------------------------------------------------ board

    @Test
    void board_columnsCountsAndSums() {
        Order a = new Order();
        a.setId(UuidUtil.randomBytes());
        OrderCardDto card = mock(OrderCardDto.class);
        OrderQueryService.CardContext ctx = mock(OrderQueryService.CardContext.class);
        when(orders.searchByStatus(any(), any(), any(), any(), any(), any(), any())).thenReturn(List.of());
        when(orders.searchByStatus(eq(OrderStatus.NEW), any(), any(), any(), any(), any(), any())).thenReturn(List.of(a));
        when(orders.searchReturning(any(), any(), any(), any())).thenReturn(List.of());
        when(queries.cardContext(any(), eq(SenderType.CUSTOMER))).thenReturn(ctx);
        when(queries.toCard(a, ctx)).thenReturn(card);
        when(orders.statsByStatus(any(), any(), any(), isNull(), isNull())).thenReturn(List.of(
                new Object[]{OrderStatus.NEW, 2L, 200L},
                new Object[]{OrderStatus.DELIVERED, 5L, 500L}));
        when(orders.statsByStatus(any(), any(), any(), notNull(), any())).thenReturn(List.<Object[]>of(
                new Object[]{OrderStatus.DELIVERED, 3L, null},
                new Object[]{OrderStatus.NEW, 99L, 99L}));
        when(orders.countReturning(any(), any(), any())).thenReturn(4L);

        OrderBoardDto board = controller().board(null, "thismonth", null, null, null);

        assertThat(board.columns().keySet())
                .containsExactly("NEW", "APPROVED", "SHIPPED", "DELIVERED", "REJECTED", "RETURNING");
        assertThat(board.columns().get("NEW")).containsExactly(card);
        assertThat(board.columns().get("APPROVED")).isEmpty();
        assertThat(board.counts()).containsExactly(
                Map.entry("NEW", 2L), Map.entry("APPROVED", 0L), Map.entry("SHIPPED", 0L),
                Map.entry("DELIVERED", 3L), Map.entry("REJECTED", 0L), Map.entry("RETURNING", 4L));
        assertThat(board.sums()).containsEntry("NEW", 200L).containsEntry("DELIVERED", 0L);
        // the card context is built once for the whole board, returning column included
        ArgumentCaptor<List<Order>> all = ArgumentCaptor.forClass(List.class);
        verify(queries).cardContext(all.capture(), eq(SenderType.CUSTOMER));
        assertThat(all.getValue()).containsExactly(a);
    }

    @Test
    void board_periodAndCapApplyToClosedColumnsOnly() {
        when(orders.searchByStatus(any(), any(), any(), any(), any(), any(), any())).thenReturn(List.of());
        when(orders.searchReturning(any(), any(), any(), any())).thenReturn(List.of());
        when(queries.cardContext(any(), any())).thenReturn(mock(OrderQueryService.CardContext.class));
        when(orders.statsByStatus(any(), any(), any(), any(), any())).thenReturn(List.of());

        controller().board(null, "thismonth", null, null, 10);

        for (OrderStatus s : OrderStatus.values()) {
            boolean closed = s == OrderStatus.DELIVERED || s == OrderStatus.REJECTED;
            ArgumentCaptor<Pageable> page = ArgumentCaptor.forClass(Pageable.class);
            if (closed) {
                verify(orders).searchByStatus(eq(s), any(), any(), any(), notNull(), isNull(), page.capture());
                assertThat(page.getValue().getPageSize()).isEqualTo(10);
            } else {
                verify(orders).searchByStatus(eq(s), any(), any(), any(), isNull(), isNull(), page.capture());
                assertThat(page.getValue().getPageSize()).isEqualTo(300);
            }
        }
    }

    @Test
    void board_closedLimitIsClamped_andUnboundedRangeQueriesStatsOnce() {
        when(orders.searchByStatus(any(), any(), any(), any(), any(), any(), any())).thenReturn(List.of());
        when(orders.searchReturning(any(), any(), any(), any())).thenReturn(List.of());
        when(queries.cardContext(any(), any())).thenReturn(mock(OrderQueryService.CardContext.class));
        when(orders.statsByStatus(any(), any(), any(), any(), any())).thenReturn(List.of());

        controller().board("  ", "all", null, null, 1000);
        ArgumentCaptor<Pageable> page = ArgumentCaptor.forClass(Pageable.class);
        verify(orders).searchByStatus(eq(OrderStatus.DELIVERED), any(), any(), any(), isNull(), isNull(), page.capture());
        assertThat(page.getValue().getPageSize()).isEqualTo(300);
        verify(orders, times(1)).statsByStatus(any(), any(), any(), isNull(), isNull());

        controller().board(null, "all", null, null, 0);
        verify(orders).searchByStatus(eq(OrderStatus.REJECTED), any(), any(), any(), isNull(), isNull(),
                org.mockito.ArgumentMatchers.argThat(p -> p.getPageSize() == 1));
    }

    @Test
    void board_customRangeWithoutDates_isBadRequest() {
        assertThatThrownBy(() -> controller().board(null, "custom", null, null, null))
                .isInstanceOf(BadRequestException.class);
    }

    // ------------------------------------------------------------------ list / by-user

    @Test
    @SuppressWarnings("unchecked")
    void list_passesFilters_clampsPaging_whitelistsSort() {
        Page<Order> page = new PageImpl<>(List.of(order));
        when(orders.search(any(), anyBoolean(), any(), any(), any(), any(), any(), any())).thenReturn(page);
        List<OrderCardDto> cards = List.of(mock(OrderCardDto.class));
        when(queries.toCards(List.of(order), SenderType.CUSTOMER)).thenReturn(cards);

        List<OrderCardDto> result = controller().list("shipped", null, "all", null, null, -3, 500,
                "evil; drop", "ASC", true);

        assertThat(result).isSameAs(cards);
        ArgumentCaptor<Pageable> p = ArgumentCaptor.forClass(Pageable.class);
        verify(orders).search(eq(OrderStatus.SHIPPED), eq(true), any(), any(), any(), isNull(), isNull(), p.capture());
        assertThat(p.getValue().getPageNumber()).isZero();
        assertThat(p.getValue().getPageSize()).isEqualTo(200);
        assertThat(p.getValue().getSort()).isEqualTo(Sort.by(Sort.Direction.ASC, "createdAt"));
    }

    @Test
    void list_sortByWhitelistedColumn_defaultsToDesc_andSizeAtLeastOne() {
        when(orders.search(any(), anyBoolean(), any(), any(), any(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of()));

        controller().list(" ", null, "all", null, null, 2, 0, "totalMinor", "sideways", false);

        ArgumentCaptor<Pageable> p = ArgumentCaptor.forClass(Pageable.class);
        verify(orders).search(isNull(), eq(false), any(), any(), any(), any(), any(), p.capture());
        assertThat(p.getValue().getPageNumber()).isEqualTo(2);
        assertThat(p.getValue().getPageSize()).isEqualTo(1);
        assertThat(p.getValue().getSort()).isEqualTo(Sort.by(Sort.Direction.DESC, "totalMinor"));
    }

    @Test
    void list_unknownStatus_isBadRequest() {
        assertThatThrownBy(() -> controller().list("lost", null, "month", null, null, 0, 20, "createdAt", "desc", false))
                .isInstanceOf(BadRequestException.class).hasMessage("неизвестный статус: lost");
        verifyNoInteractions(orders);
    }

    @Test
    void byUser_mapsTheirOrders() {
        when(orders.findByTgUserIdOrderByCreatedAtDesc(77L)).thenReturn(List.of(order));
        List<OrderCardDto> cards = List.of(mock(OrderCardDto.class));
        when(queries.toCards(List.of(order), SenderType.CUSTOMER)).thenReturn(cards);

        assertThat(controller().byUser(77L)).isSameAs(cards);
    }

    // ------------------------------------------------------------------ return wizard

    private static ReturnWizardRequest wizard(List<ReturnWizardRequest.WizardLine> lines,
                                              List<ReturnWizardRequest.Refund> refunds, Long mono, Long retain) {
        return new ReturnWizardRequest(lines, refunds, mono, retain, "note", null);
    }

    @Test
    void wizard_unknownOrder_isNotFound() {
        when(orders.findById(any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller().returnWizard(id, wizard(null, null, null, null)))
                .isInstanceOf(NotFoundException.class);
        verifyNoInteractions(adjustments, payments, audit);
    }

    @Test
    void wizard_badOutcome_isBadRequest_andNothingRuns() {
        var req = wizard(List.of(new ReturnWizardRequest.WizardLine(1, 1, "melted")), null, null, null);

        assertThatThrownBy(() -> controller().returnWizard(id, req))
                .isInstanceOf(BadRequestException.class).hasMessage("неизвестное состояние товара: melted");
        verifyNoInteractions(adjustments, payments, audit);
    }

    @Test
    void wizard_manualOnly_checksThenSaves_auditsAndReturnsFreshOrder() {
        var req = wizard(List.of(new ReturnWizardRequest.WizardLine(5, 2, null)),
                List.of(new ReturnWizardRequest.Refund("CASH", 0, null),
                        new ReturnWizardRequest.Refund("CARD_TRANSFER", 4_000, "n")),
                null, 300L);
        Order fresh = new Order();
        fresh.setId(order.getId());
        when(adjustments.registerReturnPlan(any(byte[].class), any(), any(), anyBoolean()))
                .thenReturn(new OrderAdjustmentService.Result(order, "возврат: 1"));
        when(orderService.get(order.getId())).thenReturn(fresh);
        when(queries.toDetail(fresh)).thenReturn(detail);

        OrderDetailDto result = controller().returnWizard(id, req);

        assertThat(result).isSameAs(detail);
        ArgumentCaptor<OrderAdjustmentService.ReturnPlan> plan = ArgumentCaptor.forClass(OrderAdjustmentService.ReturnPlan.class);
        InOrder in = inOrder(adjustments, audit);
        in.verify(adjustments).checkReturnPlan(eq(order.getId()), plan.capture());
        in.verify(adjustments).registerReturnPlan(eq(order.getId()), eq(plan.getValue()), eq("Иван"), eq(false));
        in.verify(audit).record("ORDER_RETURN", "ORDER", id, "возврат: 1");
        assertThat(plan.getValue().lines()).containsExactly(
                new OrderAdjustmentService.WizardLine(5, 2, OrderAdjustmentService.LineOutcome.RESTOCK));
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
        when(adjustments.registerReturnPlan(any(byte[].class), any(), any(), anyBoolean()))
                .thenReturn(new OrderAdjustmentService.Result(order, "d"));
        when(orderService.get(order.getId())).thenReturn(order);

        controller().returnWizard(id, req);

        InOrder in = inOrder(adjustments, payments, audit);
        in.verify(adjustments).checkReturnPlan(eq(order.getId()), any());
        in.verify(payments).refundableInvoice(order.getId(), 2_500);
        in.verify(payments).refund(order.getId(), "inv-1", 2_500L);
        in.verify(audit).record("ORDER_REFUND_ONLINE", "ORDER", id,
                "возврат на карту через monobank 25 ₴ (мастер возврата)");
        in.verify(adjustments).registerReturnPlan(eq(order.getId()), any(), eq("Иван"), eq(true));
        in.verify(audit).record("ORDER_RETURN", "ORDER", id, "d");
    }

    @Test
    void wizard_bankRefuses_nothingSaved_codeKept_lockReleased() {
        var req = wizard(List.of(), List.of(), 2_500L, null);
        when(payments.refundableInvoice(any(byte[].class), anyLong())).thenReturn("inv-1");
        org.mockito.Mockito.doThrow(new BadRequestException("нет денег")).when(payments)
                .refund(any(byte[].class), anyString(), anyLong());

        assertThatThrownBy(() -> controller().returnWizard(id, req))
                .isInstanceOfSatisfying(BadRequestException.class, e -> {
                    assertThat(e.getMessage()).isEqualTo(
                            "monobank не принял возврат денег: нет денег. Ничего не сохранено — исправьте и повторите.");
                    assertThat(e.getCode()).isEqualTo("MONO_REFUND_FAILED");
                });
        verify(adjustments, never()).registerReturnPlan(any(byte[].class), any(), any(), anyBoolean());
        verify(audit, never()).record(anyString(), anyString(), any(), anyString());
    }

    @Test
    void wizard_refusedPlan_sendsNoMoney_andReleasesTheLock() {
        var req = wizard(List.of(), List.of(), 2_500L, null);
        AdminOrderController c = controller();
        org.mockito.Mockito.doThrow(new BadRequestException("план плох")).doNothing()
                .when(adjustments).checkReturnPlan(any(byte[].class), any());

        assertThatThrownBy(() -> c.returnWizard(id, req)).hasMessage("план плох");
        verifyNoInteractions(payments);
        verify(audit, never()).record(anyString(), anyString(), any(), anyString());

        // the lock was released: the same order can be tried again
        when(payments.refundableInvoice(any(byte[].class), anyLong())).thenReturn("inv");
        when(adjustments.registerReturnPlan(any(byte[].class), any(), any(), anyBoolean()))
                .thenReturn(new OrderAdjustmentService.Result(order, "ok"));
        when(orderService.get(any(byte[].class))).thenReturn(order);
        c.returnWizard(id, req);
        verify(adjustments).registerReturnPlan(any(byte[].class), any(), any(), eq(true));
    }

    @Test
    void wizard_secondSubmitWhileFirstRuns_isRejected_thenFreeAgain() {
        var req = wizard(List.of(), List.of(), null, null);
        AdminOrderController c = controller();
        org.mockito.Mockito.doAnswer(inv -> {
            assertThatThrownBy(() -> c.returnWizard(id, req))
                    .isInstanceOf(BadRequestException.class)
                    .hasMessage("возврат по этому заказу уже оформляется — дождитесь окончания");
            return null;
        }).when(adjustments).checkReturnPlan(any(byte[].class), any());
        when(adjustments.registerReturnPlan(any(byte[].class), any(), any(), anyBoolean()))
                .thenReturn(new OrderAdjustmentService.Result(order, "ok"));
        when(orderService.get(any(byte[].class))).thenReturn(order);

        c.returnWizard(id, req);

        verify(adjustments, times(1)).registerReturnPlan(any(byte[].class), any(), any(), anyBoolean());
        c.returnWizard(id, req); // lock released after the first run
        verify(adjustments, times(2)).registerReturnPlan(any(byte[].class), any(), any(), anyBoolean());
    }

    @Test
    void wizard_lockIsPerOrder() {
        var req = wizard(List.of(), List.of(), null, null);
        Order other = new Order();
        other.setId(UuidUtil.randomBytes());
        String otherId = UuidUtil.toString(other.getId());
        when(orders.findById(other.getId())).thenReturn(Optional.of(other));
        AdminOrderController c = controller();
        org.mockito.Mockito.doAnswer(inv -> {
            if (java.util.Arrays.equals(inv.getArgument(0, byte[].class), order.getId())) {
                c.returnWizard(otherId, req); // a different order is not blocked
            }
            return null;
        }).when(adjustments).checkReturnPlan(any(byte[].class), any());
        when(adjustments.registerReturnPlan(any(byte[].class), any(), any(), anyBoolean()))
                .thenReturn(new OrderAdjustmentService.Result(order, "ok"));
        when(orderService.get(any(byte[].class))).thenReturn(order);

        c.returnWizard(id, req);

        verify(adjustments, times(2)).registerReturnPlan(any(byte[].class), any(), any(), anyBoolean());
    }
}
