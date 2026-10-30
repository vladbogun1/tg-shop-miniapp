package com.maxsolch.shop.order.api;

import com.maxsolch.shop.order.app.UpdateOrderStatusRequest;
import com.maxsolch.shop.order.app.MessageDto;
import com.maxsolch.shop.order.app.OrderBoardDto;
import com.maxsolch.shop.order.app.OrderCardDto;
import com.maxsolch.shop.order.app.OrderDetailDto;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.domain.RejectReasonCode;
import com.maxsolch.shop.order.domain.SenderType;
import com.maxsolch.shop.order.app.OrderOnlinePayments;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.order.app.AdminOrderQueries;
import com.maxsolch.shop.order.app.AdminOrderStatusService;
import com.maxsolch.shop.order.app.OrderChange;
import com.maxsolch.shop.order.app.OrderQueryService;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.order.app.OrderArchive;
import com.maxsolch.shop.order.app.OrderGiftCases;
import com.maxsolch.shop.order.app.OrderEditing;
import com.maxsolch.shop.order.app.OrderLifecycle;
import com.maxsolch.shop.order.app.OrderPayments;
import com.maxsolch.shop.order.app.Checkout;
import com.maxsolch.shop.platform.error.DomainException;
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
 * Characterisation of the order endpoints that are being thinned out (board, list, status): the contract is the HTTP-level result — what is returned, thrown and written to the
 * audit — not where the code lives. Wiring is in {@link #controller()} only.
 */
@ExtendWith(MockitoExtension.class)
class AdminOrderControllerTest {

    @Mock
    OrderRepository orders;
    @Mock
    Checkout checkout;
    @Mock
    OrderEditing editing;
    @Mock
    OrderLifecycle lifecycle;
    @Mock
    OrderPayments orderPayments;
    @Mock
    OrderArchive orderArchive;
    @Mock
    OrderGiftCases giftCases;
    @Mock
    OrderQueryService queries;
    @Mock
    OrderLookup lookup;
    @Mock
    AdminAuditService audit;
    @Mock
    com.maxsolch.shop.order.app.OrderDeliveryEditing deliveryEditing;
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

    AdminOrderController controller() {
        AdminOrderQueries adminQueries = new AdminOrderQueries(orders, queries, java.time.Clock.systemUTC(),
                new com.maxsolch.shop.platform.time.ShopZone(null));
        return new AdminOrderController(adminQueries,
                new AdminOrderStatusService(adminQueries, lifecycle, payments, audit),
                null, queries, null, null, null, null);
    }

    private static UpdateOrderStatusRequest status(String s, String tracking, String reason, Boolean restock,
                                                   String code, Boolean shipUnpaid, Boolean inTransit) {
        return new UpdateOrderStatusRequest(s, tracking, reason, restock, code, shipUnpaid, inTransit);
    }

    // ------------------------------------------------------------------ updateStatus

    @Test
    void status_unknown_isBadRequest_beforeAnyLookup() {
        assertThatThrownBy(() -> controller().updateStatus(id, status(" bogus ", null, null, null, null, null, null)))
                .isInstanceOf(DomainException.BadRequest.class).hasMessage("неизвестный статус:  bogus ");
        verifyNoInteractions(orders, checkout, lifecycle, audit, payments);
    }

    @Test
    void status_shippedWithoutTracking_isBadRequest() {
        assertThatThrownBy(() -> controller().updateStatus(id, status("SHIPPED", "  ", null, null, null, null, null)))
                .isInstanceOf(DomainException.BadRequest.class).hasMessage("укажите номер ТТН");
        verifyNoInteractions(orders, checkout, lifecycle, audit);
    }

    @Test
    void status_rejectedWithoutReason_isBadRequest() {
        assertThatThrownBy(() -> controller().updateStatus(id, status("rejected", null, " ", null, null, null, null)))
                .isInstanceOf(DomainException.BadRequest.class).hasMessage("укажите причину отклонения");
        verifyNoInteractions(orders, checkout, lifecycle, audit);
    }

    @Test
    void status_reasonOtherWithoutText_isBadRequest() {
        assertThatThrownBy(() -> controller().updateStatus(id, status("REJECTED", null, null, null, "OTHER", null, null)))
                .isInstanceOf(DomainException.BadRequest.class).hasMessage("для причины «Другое» напишите пояснение");
        verifyNoInteractions(orders, checkout, lifecycle, audit);
    }

    @Test
    void status_unknownReasonCode_isBadRequest() {
        assertThatThrownBy(() -> controller().updateStatus(id, status("REJECTED", null, "x", null, "WAT", null, null)))
                .isInstanceOf(DomainException.BadRequest.class).hasMessage("неизвестная причина отказа: WAT");
        verifyNoInteractions(orders, checkout, lifecycle, audit);
    }

    @Test
    void status_unknownOrder_isNotFound_andNothingChanges() {
        when(orders.findById(any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller().updateStatus(id, status("APPROVED", null, null, null, null, null, null)))
                .isInstanceOf(DomainException.NotFound.class).hasMessage("заказ не найден");
        verifyNoInteractions(checkout, lifecycle, audit, payments);
    }

    @Test
    void status_garbageId_isNotFound() {
        assertThatThrownBy(() -> controller().updateStatus("nope", status("APPROVED", null, null, null, null, null, null)))
                .isInstanceOf(DomainException.NotFound.class).hasMessage("заказ не найден");
    }

    @Test
    void status_approve_changesStatus_auditsOnce_returnsDetail() {
        Order updated = new Order();
        updated.setId(order.getId());
        when(lifecycle.changeStatus(eq(order.getId()), eq(OrderStatus.APPROVED), any(), any(), any(),
                anyBoolean(), anyBoolean())).thenReturn(updated);
        when(queries.toDetail(updated)).thenReturn(detail);

        OrderDetailDto result = controller().updateStatus(id, status("approved", null, null, null, null, null, null));

        assertThat(result).isSameAs(detail);
        verify(lifecycle).changeStatus(order.getId(), OrderStatus.APPROVED, null, null, null, true, false);
        verify(audit).record("ORDER_STATUS", "ORDER", id, "статус → APPROVED");
        verify(audit, times(1)).record(anyString(), anyString(), any(), anyString());
        verifyNoInteractions(payments);
    }

    @Test
    void status_ship_passesTrackingAndShipUnpaid_auditsTracking() {
        Order updated = new Order();
        updated.setId(order.getId());
        when(lifecycle.changeStatus(any(byte[].class), eq(OrderStatus.SHIPPED), any(), any(), any(),
                anyBoolean(), anyBoolean())).thenReturn(updated);

        controller().updateStatus(id, status("SHIPPED", "5900", null, null, null, true, null));

        verify(lifecycle).changeStatus(order.getId(), OrderStatus.SHIPPED, "5900", null, null, true, true);
        verify(audit).record("ORDER_STATUS", "ORDER", id, "статус → SHIPPED, ТТН 5900");
        verify(audit, never()).record(eq("ORDER_SHIP_UNPAID"), anyString(), any(), anyString());
    }

    @Test
    void status_shipWithoutOnlineMoney_auditsDecisionBeforeStatusEntry() {
        order.setPaymentDueAt(Instant.now());
        order.setReceivedMinor(2_500);
        Order updated = new Order();
        updated.setId(order.getId());
        when(lifecycle.changeStatus(any(byte[].class), eq(OrderStatus.SHIPPED), any(), any(), any(),
                anyBoolean(), anyBoolean())).thenReturn(updated);

        controller().updateStatus(id, status("SHIPPED", "5900", null, null, null, true, null));

        InOrder in = inOrder(lifecycle, audit);
        in.verify(lifecycle).changeStatus(any(byte[].class), any(), any(), any(), any(), anyBoolean(), anyBoolean());
        in.verify(audit).record("ORDER_SHIP_UNPAID", "ORDER", id,
                "отправлен без онлайн-оплаты (не пришло 75 ₴) по решению админа Иван");
        in.verify(audit).record("ORDER_STATUS", "ORDER", id, "статус → SHIPPED, ТТН 5900");
    }

    @Test
    void status_reject_closesInvoices_andAuditsRestock() {
        Order updated = new Order();
        updated.setId(order.getId());
        when(lifecycle.changeStatus(any(byte[].class), eq(OrderStatus.REJECTED), any(), any(), any(),
                anyBoolean(), anyBoolean())).thenReturn(updated);

        controller().updateStatus(id, status("REJECTED", null, "не вышел на связь", null, "NO_RESPONSE", null, null));

        verify(lifecycle).changeStatus(order.getId(), OrderStatus.REJECTED, null, "не вышел на связь",
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
        when(lifecycle.changeStatus(any(byte[].class), eq(OrderStatus.REJECTED), any(), any(), any(),
                anyBoolean(), anyBoolean())).thenReturn(updated);

        controller().updateStatus(id, status("REJECTED", null, "брак", false, null, null, null));

        verify(audit).record("ORDER_STATUS", "ORDER", id, "статус → REJECTED, причина: брак, БЕЗ возврата стока");
    }

    @Test
    void status_rejectInTransit_goesThroughReject_andAuditsTheTrip() {
        Order updated = new Order();
        updated.setId(order.getId());
        updated.setReturnStatus(Order.RETURN_IN_TRANSIT);
        when(lifecycle.reject(any(byte[].class), any(), any(), anyBoolean(), anyBoolean())).thenReturn(updated);

        controller().updateStatus(id, status("REJECTED", null, "отказ на почте", null, "REFUSED_AT_POST", null, true));

        verify(lifecycle).reject(order.getId(), "отказ на почте", RejectReasonCode.REFUSED_AT_POST, true, true);
        verify(lifecycle, never()).changeStatus(any(byte[].class), any(), any(), any(), any(), anyBoolean(), anyBoolean());
        verify(payments).closeOpenInvoices(order.getId());
        verify(audit).record("ORDER_STATUS", "ORDER", id,
                "статус → REJECTED, код причины REFUSED_AT_POST, причина: отказ на почте, "
                        + "посылка едет назад (сток — по приходу)");
    }

    @Test
    void status_returnInTransit_ignoredForNonReject() {
        Order updated = new Order();
        updated.setId(order.getId());
        when(lifecycle.changeStatus(any(byte[].class), eq(OrderStatus.DELIVERED), any(), any(), any(),
                anyBoolean(), anyBoolean())).thenReturn(updated);

        controller().updateStatus(id, status("DELIVERED", null, null, null, null, null, true));

        verify(lifecycle, never()).reject(any(byte[].class), any(), any(), anyBoolean(), anyBoolean());
        verify(lifecycle).changeStatus(order.getId(), OrderStatus.DELIVERED, null, null, null, true, false);
    }

    @Test
    void status_serviceFails_noAudit_noInvoiceClosing() {
        when(lifecycle.changeStatus(any(byte[].class), any(), any(), any(), any(), anyBoolean(), anyBoolean()))
                .thenThrow(new DomainException.BadRequest("нельзя"));

        assertThatThrownBy(() -> controller().updateStatus(id, status("REJECTED", null, "x", null, null, null, null)))
                .isInstanceOf(DomainException.BadRequest.class).hasMessage("нельзя");
        verifyNoInteractions(audit, payments);
    }

    @Test
    void status_invoiceClosingFails_exceptionPropagates_andNothingIsAudited() {
        Order updated = new Order();
        updated.setId(order.getId());
        when(lifecycle.changeStatus(any(byte[].class), any(), any(), any(), any(), anyBoolean(), anyBoolean()))
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
                .isInstanceOf(DomainException.BadRequest.class);
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
                .isInstanceOf(DomainException.BadRequest.class).hasMessage("неизвестный статус: lost");
        verifyNoInteractions(orders);
    }

    @Test
    void byUser_mapsTheirOrders() {
        when(orders.findByTgUserIdOrderByCreatedAtDesc(77L)).thenReturn(List.of(order));
        List<OrderCardDto> cards = List.of(mock(OrderCardDto.class));
        when(queries.toCards(List.of(order), SenderType.CUSTOMER)).thenReturn(cards);

        assertThat(controller().byUser(77L)).isSameAs(cards);
    }
}
