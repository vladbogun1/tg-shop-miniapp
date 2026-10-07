package com.maxsolch.shop.push;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.inbox.InboxDtos.Inbox;
import com.maxsolch.shop.inbox.InboxService;
import com.maxsolch.shop.media.MediaSigner;
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
import static org.mockito.ArgumentMatchers.eq;
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
    MediaSigner media;
    PushNotificationListener listener;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        push = mock(AdminPushService.class);
        jdbc = mock(JdbcTemplate.class);
        inbox = mock(InboxService.class);
        media = mock(MediaSigner.class);
        listener = new PushNotificationListener(push, jdbc, inbox, media);
        when(jdbc.queryForList(anyString(), eq(String.class), any(Object.class))).thenReturn(List.of("Иван Петров"));
        when(media.signedUrl("chat/a.jpg")).thenReturn("/api/media?key=chat%2Fa.jpg&exp=1&sig=s");
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
    void customerTextShowsWhoAndWhat() {
        listener.onChatMessage(new OrderEvents.ChatMessage(UuidUtil.toBytes(ORDER), false, "а можно\n на НП 12?"));
        PushMessage m = sent();
        assertThat(m.title()).isEqualTo("💬 Иван П. · #9a6feb7d");
        assertThat(m.body()).isEqualTo("а можно на НП 12?");
        assertThat(m.url()).isEqualTo("/orders/" + ORDER + "?tab=chat");
        assertThat(m.tag()).isEqualTo("chat-" + ORDER);
        assertThat(m.image()).isNull();
        assertThat(m.group().title()).isEqualTo("💬 Иван П. · #9a6feb7d");
        assertThat(m.group().line()).isEqualTo("а можно на НП 12?");
    }

    @Test
    void customerPhotoCarriesASmallSignedPreview() {
        listener.onChatMessage(new OrderEvents.ChatMessage(UuidUtil.toBytes(ORDER), false, "📷 Фото",
                "PHOTO", null, "chat/a.jpg", "a.jpg"));
        PushMessage m = sent();
        assertThat(m.title()).isEqualTo("📷 Иван П. · #9a6feb7d");
        assertThat(m.body()).isEqualTo("Фото");
        assertThat(m.image()).isEqualTo("/api/media?key=chat%2Fa.jpg&exp=1&sig=s&w=" + PushNotificationListener.IMAGE_WIDTH);
        assertThat(m.group().line()).isEqualTo("📷 Фото");
    }

    @Test
    void customerFileShowsItsName() {
        listener.onChatMessage(new OrderEvents.ChatMessage(UuidUtil.toBytes(ORDER), false, "оплата",
                "FILE", "оплата", "chat/b.pdf", "schet.pdf"));
        PushMessage m = sent();
        assertThat(m.title()).startsWith("📎 ");
        assertThat(m.body()).isEqualTo("schet.pdf — оплата");
        assertThat(m.image()).isNull();
    }

    @Test
    void customerNames() {
        assertThat(PushNotificationListener.shortName("Иван Петров")).isEqualTo("Иван П.");
        assertThat(PushNotificationListener.shortName("  иван  петров сидорович ")).isEqualTo("иван П.");
        assertThat(PushNotificationListener.shortName("Иван")).isEqualTo("Иван");
        assertThat(PushNotificationListener.shortName(" ")).isEqualTo("Клиент");
        assertThat(PushNotificationListener.shortName(null)).isEqualTo("Клиент");
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
