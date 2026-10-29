package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** The admin's order buttons: the scenario runs, then exactly one audit entry says what was done. */
class AdminOrdersTest {

    private final AdminOrderQueries queries = mock(AdminOrderQueries.class);
    private final OrderLookup lookup = mock(OrderLookup.class);
    private final OrderEditing editing = mock(OrderEditing.class);
    private final OrderPayments orderPayments = mock(OrderPayments.class);
    private final OrderArchive archive = mock(OrderArchive.class);
    private final OrderMerge merges = mock(OrderMerge.class);
    private final OrderOnlinePayments payments = mock(OrderOnlinePayments.class);
    private final OrderDispatchNotifier dispatch = mock(OrderDispatchNotifier.class);
    private final MessageService messages = mock(MessageService.class);
    private final AdminAuditService audit = mock(AdminAuditService.class);
    private final CurrentActor actor = mock(CurrentActor.class);

    private final Order order = new Order();
    private final String id;
    private AdminOrders orders;

    AdminOrdersTest() {
        order.setId(UuidUtil.randomBytes());
        id = UuidUtil.toString(order.getId());
    }

    @BeforeEach
    void setUp() {
        when(queries.load(id)).thenReturn(order);
        when(audit.currentAdminName()).thenReturn("Иван");
        orders = new AdminOrders(queries, lookup, mock(Checkout.class), editing, orderPayments, archive,
                mock(OrderGiftCases.class), mock(OrderDeliveryEditing.class), merges, payments, dispatch, messages,
                audit, actor);
    }

    @Test
    void broadcastDispatch_auditsHowManyCardsWerePosted() {
        when(dispatch.broadcastDispatch()).thenReturn(3);

        assertThat(orders.broadcastDispatch()).isEqualTo(3);

        verify(audit).record("DISPATCH_BROADCAST", "ORDER", null, "карточек к отправке выложено заново: 3");
    }

    @Test
    void discount_clear_auditsRemoval() {
        when(editing.applyDiscount(any(), any(), any(), any(), anyBoolean(), anyBoolean())).thenReturn(order);

        orders.applyDiscount(id, null, null, null, true, true);

        verify(audit).record("ORDER_DISCOUNT", "ORDER", id, "скидка снята");
    }

    @Test
    void discount_byPromoCode_namesTheCode() {
        when(editing.applyDiscount(any(), any(), any(), any(), anyBoolean(), anyBoolean())).thenReturn(order);

        orders.applyDiscount(id, "SALE", null, null, false, true);

        verify(audit).record("ORDER_DISCOUNT", "ORDER", id, "скидка: промокод SALE");
    }

    @Test
    void setPaid_blankChannelMeansOther_andNoteIsAudited() {
        when(orderPayments.markPaid(any(), anyLong(), any(), any(), any())).thenReturn(order);

        orders.setPaid(id, 0, " ", " нал ");

        verify(orderPayments).markPaid(eq(order.getId()), eq(0L), eq(OrderMoneyMovement.Channel.OTHER), eq("Иван"),
                eq(" нал "));
        verify(audit).record(eq("ORDER_PAID"), eq("ORDER"), eq(id), org.mockito.ArgumentMatchers.contains("оплата снята"));
    }

    @Test
    void merge_refusedWhileTheBankIsProcessingAPayment_changesNothing() {
        Order source = new Order();
        source.setId(UuidUtil.randomBytes());
        String sourceId = UuidUtil.toString(source.getId());
        when(queries.load(sourceId)).thenReturn(source);
        when(payments.hasPaymentInFlight(source.getId())).thenReturn(true);

        assertThatThrownBy(() -> orders.merge(id, sourceId, false, true, null))
                .isInstanceOf(DomainException.BadRequest.class);

        verifyNoInteractions(merges);
        verify(audit, never()).record(any(), any(), any(), any());
    }

    @Test
    void sendMessage_isSignedWithTheActingAdmin() {
        when(actor.userId()).thenReturn(42L);
        SendMessageRequest req = new SendMessageRequest("привет", "TEXT", null, null, null, null);

        orders.sendMessage(id, req);

        verify(messages).postAdminMessage(order.getId(), 42L, "Иван", req);
    }

    @Test
    void archive_failure_leavesNoAuditEntry() {
        when(archive.archive(any(), any(), any())).thenThrow(new DomainException.BadRequest("нельзя"));

        assertThatThrownBy(() -> orders.archive(id, "x")).isInstanceOf(DomainException.BadRequest.class);

        verify(audit, never()).record(any(), any(), any(), any());
        verify(archive, never()).unarchive(isNull());
    }

    private static long anyLong() {
        return org.mockito.ArgumentMatchers.anyLong();
    }
}
