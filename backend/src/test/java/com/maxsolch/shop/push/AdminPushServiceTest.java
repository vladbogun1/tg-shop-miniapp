package com.maxsolch.shop.push;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.push.AdminPushService.PushMessage;
import com.maxsolch.shop.push.AdminPushService.SendResult;
import com.maxsolch.shop.push.PushSubscriptionStore.Subscription;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.ConflictException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.net.URI;
import java.security.KeyPair;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.AbstractExecutorService;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** The push service without the network: the transport is a mock answering like a push service. */
class AdminPushServiceTest {

    static final String FCM = "https://fcm.googleapis.com/fcm/send/abc:def";
    static final String APPLE = "https://web.push.apple.com/QGx1Y2t5";

    PushSubscriptionStore store;
    PushTransport transport;
    AdminPushService service;
    String uaP256dh;
    String uaAuth;

    @BeforeEach
    void setUp() throws Exception {
        store = mock(PushSubscriptionStore.class);
        transport = mock(PushTransport.class);
        KeyPair vapid = WebPushCrypto.generateKeyPair();
        service = new AdminPushService(props(
                        WebPushCrypto.b64url(WebPushCrypto.encode((ECPublicKey) vapid.getPublic())),
                        WebPushCrypto.b64url(WebPushCrypto.encode((ECPrivateKey) vapid.getPrivate())),
                        "mailto:owner@example.com"),
                store, transport, new ObjectMapper(), new DirectExecutor(),
                Clock.fixed(Instant.parse("2026-10-04T10:00:00Z"), ZoneOffset.UTC));
        KeyPair ua = WebPushCrypto.generateKeyPair();
        uaP256dh = WebPushCrypto.b64url(WebPushCrypto.encode((ECPublicKey) ua.getPublic()));
        uaAuth = WebPushCrypto.b64url(new byte[16]);
    }

    @Test
    void offWithoutKeysAndNeverSends() {
        AdminPushService off = new AdminPushService(props("", "", ""), store, transport, new ObjectMapper(),
                new DirectExecutor(), Clock.systemUTC());
        assertThat(off.enabled()).isFalse();
        assertThat(off.config(1).publicKey()).isNull();
        off.notifyAdmins(new PushMessage("t", "b", "/", null, null, false));
        verifyNoInteractions(store, transport);
        assertThatThrownBy(() -> off.subscribe(1, FCM, uaP256dh, uaAuth, null))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void mismatchedOrBrokenKeysKeepItOffWithoutFailingStartup() throws Exception {
        KeyPair a = WebPushCrypto.generateKeyPair();
        KeyPair b = WebPushCrypto.generateKeyPair();
        AdminPushService mismatched = new AdminPushService(props(
                WebPushCrypto.b64url(WebPushCrypto.encode((ECPublicKey) a.getPublic())),
                WebPushCrypto.b64url(WebPushCrypto.encode((ECPrivateKey) b.getPrivate())),
                "mailto:x@y.z"), store, transport, new ObjectMapper(), new DirectExecutor(), Clock.systemUTC());
        assertThat(mismatched.enabled()).isFalse();
        AdminPushService garbage = new AdminPushService(props("not-a-key", "%%%", "mailto:x@y.z"),
                store, transport, new ObjectMapper(), new DirectExecutor(), Clock.systemUTC());
        assertThat(garbage.enabled()).isFalse();
    }

    @Test
    void sendsEncryptedRequestWithVapidHeaders() throws Exception {
        when(store.all()).thenReturn(List.of(new Subscription(7, 1, FCM, uaP256dh, uaAuth)));
        when(transport.post(any(), any(), any())).thenReturn(201);

        service.notifyAdmins(new PushMessage("Новый заказ #9a6feb7d", "1 300 ₴ · сайт", "/orders/x", "order-x", 3, true));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> headers = ArgumentCaptor.forClass(Map.class);
        ArgumentCaptor<byte[]> body = ArgumentCaptor.forClass(byte[].class);
        verify(transport).post(eq(URI.create(FCM)), headers.capture(), body.capture());
        assertThat(headers.getValue())
                .containsEntry("Content-Encoding", "aes128gcm")
                .containsEntry("TTL", "86400")
                .containsEntry("Urgency", "high");
        assertThat(headers.getValue().get("Authorization")).startsWith("vapid t=").contains(", k=");
        assertThat(body.getValue().length).isGreaterThan(86 + 16);
        verify(store).markSuccess(7);
    }

    @Test
    void goneSubscriptionsAreDeletedOthersCountedAsFailures() throws Exception {
        String gone = FCM + "gone";
        String broken = FCM + "broken";
        when(store.all()).thenReturn(List.of(
                new Subscription(1, 1, FCM, uaP256dh, uaAuth),
                new Subscription(2, 1, gone, uaP256dh, uaAuth),
                new Subscription(3, 1, broken, uaP256dh, uaAuth),
                new Subscription(4, 1, APPLE, uaP256dh, uaAuth)));
        when(transport.post(eq(URI.create(FCM)), any(), any())).thenReturn(201);
        when(transport.post(eq(URI.create(gone)), any(), any())).thenReturn(410);
        when(transport.post(eq(URI.create(broken)), any(), any())).thenReturn(500);
        when(transport.post(eq(URI.create(APPLE)), any(), any())).thenReturn(404);

        SendResult r = service.sendTo(store.all(), new PushMessage("t", "b", "/", null, null, false));

        assertThat(r).isEqualTo(new SendResult(1, 2, 1));
        verify(store).deleteById(2);
        verify(store).deleteById(4);
        verify(store).markFailure(3);
        verify(store, never()).deleteById(3);
    }

    @Test
    void networkErrorOnOneDeviceDoesNotStopTheOthers() throws Exception {
        String down = FCM + "down";
        when(transport.post(eq(URI.create(down)), any(), any())).thenThrow(new java.io.IOException("timeout"));
        when(transport.post(eq(URI.create(FCM)), any(), any())).thenReturn(201);
        SendResult r = service.sendTo(List.of(
                        new Subscription(1, 1, down, uaP256dh, uaAuth),
                        new Subscription(2, 1, FCM, uaP256dh, uaAuth)),
                new PushMessage("t", "b", "/", null, null, false));
        assertThat(r).isEqualTo(new SendResult(1, 0, 1));
        verify(store).markFailure(1);
        verify(store).markSuccess(2);
    }

    @Test
    void subscribeAcceptsKnownPushServicesOnly() {
        service.subscribe(1, FCM, uaP256dh, uaAuth, "UA");
        service.subscribe(1, APPLE, uaP256dh, uaAuth, null);
        verify(store).upsert(1, FCM, uaP256dh, uaAuth, "UA");

        for (String bad : List.of("http://fcm.googleapis.com/x", "https://evil.example.com/x",
                "https://fcm.googleapis.com.evil.com/x", "https://localhost:8080/x", "not a url")) {
            assertThatThrownBy(() -> service.subscribe(1, bad, uaP256dh, uaAuth, null))
                    .as(bad).isInstanceOf(BadRequestException.class);
        }
        assertThatThrownBy(() -> service.subscribe(1, FCM, "AAAA", uaAuth, null))
                .isInstanceOf(BadRequestException.class);
        verify(store, never()).upsert(anyLong(), eq("https://evil.example.com/x"), any(), any(), any());
    }

    @Test
    void testPushNeedsASubscribedDevice() {
        when(store.byEndpoint(FCM)).thenReturn(List.of());
        assertThatThrownBy(() -> service.sendTest(1, FCM)).isInstanceOf(BadRequestException.class);
    }

    @Test
    void payloadKeepsOnlyRelativeUrlsAndShortTexts() {
        String json = new String(service.payload(new PushMessage("x".repeat(200), "b", "https://evil.example.com", "t", 5, false)),
                java.nio.charset.StandardCharsets.UTF_8);
        assertThat(json).contains("\"url\":\"/\"").contains("\"badge\":5").contains("…");
    }

    @Test
    void payloadCarriesTheChatPreviewAndGroup() {
        String json = new String(service.payload(new PushMessage("t", "b", "/orders/1", "chat-1", null, true,
                        "/api/media?key=k&w=480", new AdminPushService.Group("💬 Иван П.", "привет"))),
                java.nio.charset.StandardCharsets.UTF_8);
        assertThat(json).contains("\"image\":\"/api/media?key=k&w=480\"")
                .contains("\"group\":{").contains("\"line\":\"привет\"");
        String foreign = new String(service.payload(new PushMessage("t", "b", "/", null, null, false,
                "https://evil.example.com/x.png", null)), java.nio.charset.StandardCharsets.UTF_8);
        assertThat(foreign).doesNotContain("image").doesNotContain("group");
    }

    @Test
    void moneyAndSourceLabels() {
        assertThat(PushNotificationListener.money(130000, "UAH")).isEqualTo("1 300 ₴");
        assertThat(PushNotificationListener.money(99950, "UAH")).isEqualTo("999,50 ₴");
        assertThat(PushNotificationListener.sourceLabel("WEB")).isEqualTo("сайт");
        assertThat(PushNotificationListener.sourceLabel("MINIAPP")).isEqualTo("Mini App");
    }

    private static AppProperties props(String pub, String priv, String subject) {
        AppProperties p = new AppProperties();
        p.getPush().setVapidPublicKey(pub);
        p.getPush().setVapidPrivateKey(priv);
        p.getPush().setVapidSubject(subject);
        return p;
    }

    /** Runs tasks inline so assertions see their effects. */
    static final class DirectExecutor extends AbstractExecutorService {
        private boolean shutdown;

        @Override
        public void execute(Runnable command) {
            command.run();
        }

        @Override
        public void shutdown() {
            shutdown = true;
        }

        @Override
        public List<Runnable> shutdownNow() {
            shutdown = true;
            return List.of();
        }

        @Override
        public boolean isShutdown() {
            return shutdown;
        }

        @Override
        public boolean isTerminated() {
            return shutdown;
        }

        @Override
        public boolean awaitTermination(long timeout, TimeUnit unit) {
            return true;
        }
    }
}
