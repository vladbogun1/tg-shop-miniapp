package com.maxsolch.shop.push;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.inbox.InboxDtos.Inbox;
import com.maxsolch.shop.inbox.InboxService;
import com.maxsolch.shop.push.AdminPushService.PushMessage;
import com.maxsolch.shop.service.OrderEvents;
import com.maxsolch.shop.site.SiteRevalidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Which events ping the owner's phone, with what text and which screen a tap opens. */
class PushNotificationListenerTest {

    static final String ORDER = "9a6feb7d-08a9-4ecb-b046-7d1e9ccd9b97";

    AdminPushService push;
    JdbcTemplate jdbc;
    InboxService inbox;
    PushNotificationListener listener;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        push = mock(AdminPushService.class);
        jdbc = mock(JdbcTemplate.class);
        inbox = mock(InboxService.class);
        listener = new PushNotificationListener(push, jdbc, inbox);
        // The push thread runs inline in the test.
        doAnswer(inv -> {
            ((Runnable) inv.getArgument(0)).run();
            return null;
        }).when(push).runAsync(any());
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object.class))).thenReturn(List.of(
                new PushNotificationListener.OrderInfo(ORDER, "9a6feb7d", 130000, "UAH", "WEB")));
        when(inbox.inbox()).thenReturn(new Inbox(Instant.now(), 4, List.of(), 2, 24, 14));
    }

    private PushMessage sent() {
        ArgumentCaptor<PushMessage> m = ArgumentCaptor.forClass(PushMessage.class);
        verify(push).notifyAdmins(m.capture());
        return m.getValue();
    }

    @Test
    void newOrder() {
        listener.onCreated(new OrderEvents.Created(UuidUtil.toBytes(ORDER)));
        PushMessage m = sent();
        assertThat(m.title()).isEqualTo("Новый заказ #9a6feb7d");
        assertThat(m.body()).isEqualTo("1 300 ₴ · сайт");
        assertThat(m.url()).isEqualTo("/orders/" + ORDER);
        assertThat(m.badge()).isEqualTo(4);
        assertThat(m.urgent()).isTrue();
    }

    @Test
    void paymentClaim() {
        listener.onPaymentClaimed(new OrderEvents.PaymentClaimed(UuidUtil.toBytes(ORDER)));
        PushMessage m = sent();
        assertThat(m.title()).contains("#9a6feb7d");
        assertThat(m.body()).contains("1 300 ₴");
        assertThat(m.tag()).isEqualTo("pay-" + ORDER);
    }

    @Test
    void customerChatOpensTheChatWithoutTheMessageText() {
        listener.onChatMessage(new OrderEvents.ChatMessage(UuidUtil.toBytes(ORDER), false, "мой телефон +380501234567"));
        PushMessage m = sent();
        assertThat(m.url()).isEqualTo("/orders/" + ORDER + "?tab=chat");
        assertThat(m.title() + m.body()).doesNotContain("+380501234567");
    }

    @Test
    void adminOwnMessageDoesNotNotify() {
        listener.onChatMessage(new OrderEvents.ChatMessage(UuidUtil.toBytes(ORDER), true, "ответ"));
        verify(push, never()).runAsync(any());
        verify(push, never()).notifyAdmins(any());
    }

    @Test
    void siteFailureOpensInbox() {
        listener.onSiteFailed(new SiteRevalidator.Failed("HTTP 500"));
        assertThat(sent().url()).isEqualTo("/inbox");
    }

    @Test
    void missingOrderSendsNothing() {
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object.class))).thenReturn(List.of());
        listener.onCreated(new OrderEvents.Created(UuidUtil.toBytes(ORDER)));
        verify(push, never()).notifyAdmins(any());
    }

    @Test
    void badgeIsOptional() {
        when(inbox.inbox()).thenThrow(new IllegalStateException("db down"));
        listener.onCreated(new OrderEvents.Created(UuidUtil.toBytes(ORDER)));
        assertThat(sent().badge()).isNull();
    }
}
