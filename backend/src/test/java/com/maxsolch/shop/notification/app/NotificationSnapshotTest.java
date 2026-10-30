package com.maxsolch.shop.notification.app;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.payment.domain.ReceiptKind;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageText;

import java.time.Instant;

import static com.maxsolch.shop.notification.app.NotifyHarness.order;
import static com.maxsolch.shop.notification.app.NotifyHarness.pickupOrder;

/**
 * Characterization of every message {@link OrderCustomerNotifier and OrderSellerNotifier} sends: text, parse mode, chat, topic,
 * keyboard and journal entry, for a uk / ru / en customer and for the seller's channel. The snapshots
 * in {@code src/test/resources/snapshots/notify} were written from the code before it was split into
 * CustomerBot / SellerChannel and must not change.
 */
class NotificationSnapshotTest {

    private static final Instant UNTIL = Instant.parse("2026-11-18T10:00:00Z");
    private static final long CHAT = -1001234567890L;

    private final NotifyHarness h = new NotifyHarness();

    // ---------------- seller's channel ----------------

    @Test
    void onNewOrder() throws Exception {
        Order rich = order(NotifyHarness.TG_UK, OrderStatus.NEW);
        rich.setSource(com.maxsolch.shop.order.domain.OrderSource.WEB);
        h.scene("NEW rich web order", rich, () -> h.seller.onNewOrder(rich));
        Order pickup = pickupOrder(null, OrderStatus.NEW);
        h.scene("NEW pickup order, no telegram", pickup, () -> h.seller.onNewOrder(pickup));
        h.props.getTelegram().setNotifyTopicNew(0);
        h.props.setAdminBaseUrl("http://localhost:3000");
        Order noTopic = order(NotifyHarness.TG_RU, OrderStatus.NEW);
        h.scene("topic 0, admin url not https", noTopic, () -> h.seller.onNewOrder(noTopic));
        h.assertSnapshot("onNewOrder");
    }

    @Test
    void onStatusChanged() throws Exception {
        for (OrderStatus s : OrderStatus.values()) {
            Order o = order(NotifyHarness.TG_UK, s);
            o.setTrackingNumber(s == OrderStatus.SHIPPED || s == OrderStatus.DELIVERED ? "20450123456789" : null);
            o.setRejectReason(s == OrderStatus.REJECTED ? "Нет в наличии <срочно>" : null);
            o.setNotifyChatId(CHAT);
            o.setNotifyMessageId(321);
            o.setNotifyThreadId(11);
            h.scene(s + " with a card in the old topic", o, () -> h.seller.onStatusChanged(o));
        }
        Order fresh = order(NotifyHarness.TG_UK, OrderStatus.APPROVED);
        h.scene("APPROVED without a card", fresh, () -> h.seller.onStatusChanged(fresh));
        Order stale = order(NotifyHarness.TG_UK, OrderStatus.SHIPPED);
        stale.setNotifyChatId(CHAT);
        stale.setNotifyMessageId(77);
        h.failure = call -> call instanceof org.telegram.telegrambots.meta.api.methods.updatingmessages.DeleteMessage
                ? new TelegramApiException("Bad Request: message to delete not found") : null;
        h.scene("delete fails, card is re-posted anyway", stale, () -> h.seller.onStatusChanged(stale));
        h.assertSnapshot("onStatusChanged");
    }

    @Test
    void onCustomerChatMessage() throws Exception {
        Order o = order(NotifyHarness.TG_UK, OrderStatus.APPROVED);
        h.scene("with preview", o, () -> h.seller.onCustomerChatMessage(o, "Добрий день, коли <відправка>?"));
        h.scene("long preview (trimmed to 200)", o, () -> h.seller.onCustomerChatMessage(o, "ы".repeat(250)));
        h.scene("no preview", o, () -> h.seller.onCustomerChatMessage(o, null));
        h.scene("blank preview", o, () -> h.seller.onCustomerChatMessage(o, "  "));
        h.props.getTelegram().setNotifyTopicChat(0);
        h.scene("chat topic 0", o, () -> h.seller.onCustomerChatMessage(o, "hi"));
        h.assertSnapshot("onCustomerChatMessage");
    }

    @Test
    void onCancelRequested() throws Exception {
        Order o = order(NotifyHarness.TG_UK, OrderStatus.APPROVED);
        o.setReceivedMinor(2_000_000); // more than the total: capped
        o.setCancelRequestReason("Передумав <зовсім> " + "x".repeat(320));
        h.scene("with reason", o, () -> h.seller.onCancelRequested(o));
        Order bare = order(NotifyHarness.TG_UK, OrderStatus.APPROVED);
        h.scene("no reason, nothing received", bare, () -> h.seller.onCancelRequested(bare));
        h.assertSnapshot("onCancelRequested");
    }

    @Test
    void dispatchCard() throws Exception {
        Order o = order(NotifyHarness.TG_UK, OrderStatus.APPROVED);
        o.setReceivedMinor(300_000);
        h.scene("post: new card, part prepaid", o, () -> h.seller.postDispatchCard(o));
        h.scene("post again: already tracked", o, () -> h.seller.postDispatchCard(o));

        Order paid = order(NotifyHarness.TG_UK, OrderStatus.APPROVED);
        paid.setPaid(true);
        paid.setReceivedMinor(paid.getTotalMinor());
        h.scene("post: fully paid, COD 0", paid, () -> h.seller.postDispatchCard(paid));

        Order unpaid = pickupOrder(null, OrderStatus.APPROVED);
        h.scene("post: unpaid pickup", unpaid, () -> h.seller.postDispatchCard(unpaid));

        Order sync = order(NotifyHarness.TG_UK, OrderStatus.APPROVED);
        h.scene("sync: no id → posts", sync, () -> h.seller.syncDispatchCard(sync));
        h.scene("sync: id tracked → edits in place", sync, () -> h.seller.syncDispatchCard(sync));

        h.failure = call -> call instanceof EditMessageText ? new TelegramApiException("Bad Request: message is not modified") : null;
        h.scene("sync: not modified", sync, () -> h.seller.syncDispatchCard(sync));
        h.failure = call -> call instanceof EditMessageText ? new TelegramApiException("Bad Request: message to edit not found") : null;
        h.scene("sync: message deleted by hand → re-post", sync, () -> h.seller.syncDispatchCard(sync));
        h.failure = call -> call instanceof EditMessageText ? new TelegramApiException("Bad Request: message can't be edited") : null;
        h.scene("sync: can't be edited → re-post", sync, () -> h.seller.syncDispatchCard(sync));
        h.failure = call -> call instanceof EditMessageText ? new TelegramApiException("Too Many Requests: retry after 5") : null;
        h.scene("sync: other failure → nothing changes", sync, () -> h.seller.syncDispatchCard(sync));
        h.failure = call -> null;

        h.scene("remove(order)", sync, () -> h.seller.removeDispatchCard(sync));
        h.scene("remove(order) again: no id", sync, () -> h.seller.removeDispatchCard(sync));
        h.scene("remove(id)", null, () -> h.seller.removeDispatchCard(Integer.valueOf(900)));
        h.scene("remove(null)", null, () -> h.seller.removeDispatchCard((Integer) null));
        Order failing = order(NotifyHarness.TG_UK, OrderStatus.APPROVED);
        failing.setDispatchMessageId(55);
        h.failure = call -> new TelegramApiException("Bad Request: message to delete not found");
        h.scene("remove(order) when telegram fails: id cleared anyway", failing, () -> h.seller.removeDispatchCard(failing));
        h.assertSnapshot("dispatchCard");
    }

    @Test
    void dispatchCardChannelBlank() throws Exception {
        h.props.getTelegram().setNotifyChatId(" ");
        Order o = order(NotifyHarness.TG_UK, OrderStatus.APPROVED);
        h.scene("post, blank chat", o, () -> h.seller.postDispatchCard(o));
        h.scene("sync, blank chat", o, () -> h.seller.syncDispatchCard(o));
        o.setDispatchMessageId(5);
        h.scene("remove(id), blank chat", o, () -> h.seller.removeDispatchCard(5));
        h.props.getTelegram().setNotifyChatId("0");
        Order zero = order(NotifyHarness.TG_UK, OrderStatus.APPROVED);
        h.scene("post, chat \"0\" (not treated as empty here)", zero, () -> h.seller.postDispatchCard(zero));
        h.assertSnapshot("dispatchCardChannelBlank");
    }

    // ---------------- customer DMs ----------------

    @Test
    void notifyCustomerStatus() throws Exception {
        h.eachLang("", (l, tg) -> {
            for (OrderStatus s : OrderStatus.values()) {
                Order o = order(tg, s);
                h.scene(l + " / " + s, o, () -> h.customer.notifyCustomerStatus(o));
            }
            Order shipped = order(tg, OrderStatus.SHIPPED);
            shipped.setTrackingNumber("20450123456789");
            h.scene(l + " / SHIPPED with tracking", shipped, () -> h.customer.notifyCustomerStatus(shipped));
            for (String reason : new String[]{"Нет в наличии <срочно>", "Отменён покупателем",
                    "Не оплачен в течение 24 ч", "Объединён с заказом #1a2b3c4d"}) {
                Order rej = order(tg, OrderStatus.REJECTED);
                rej.setRejectReason(reason);
                h.scene(l + " / REJECTED: " + reason, rej, () -> h.customer.notifyCustomerStatus(rej));
            }
            Order paidCase = order(tg, OrderStatus.APPROVED);
            paidCase.setGiftCaseStatus("SEALED");
            paidCase.setPaid(true);
            h.scene(l + " / APPROVED with a sealed case, paid", paidCase, () -> h.customer.notifyCustomerStatus(paidCase));
            Order unpaidCase = order(tg, OrderStatus.NEW);
            unpaidCase.setGiftCaseStatus("SEALED");
            h.scene(l + " / NEW with a sealed case, unpaid", unpaidCase, () -> h.customer.notifyCustomerStatus(unpaidCase));
            Order rejCase = order(tg, OrderStatus.REJECTED);
            rejCase.setGiftCaseStatus("SEALED");
            h.scene(l + " / REJECTED with a sealed case (no case line)", rejCase, () -> h.customer.notifyCustomerStatus(rejCase));
        });
        Mockito.when(h.settings.getBool(SettingsRegistry.NOTIFY_CUSTOMER_STATUS)).thenReturn(false);
        Order off = order(NotifyHarness.TG_UK, OrderStatus.APPROVED);
        h.scene("switch off in settings → journal only", off, () -> h.customer.notifyCustomerStatus(off));
        Order offNoTg = order(null, OrderStatus.APPROVED);
        h.scene("switch off, no telegram → nothing", offNoTg, () -> h.customer.notifyCustomerStatus(offNoTg));
        h.assertSnapshot("notifyCustomerStatus");
    }

    @Test
    void notifyCustomerGift() throws Exception {
        h.eachLang("", (l, tg) -> {
            Order o = order(tg, OrderStatus.APPROVED);
            h.scene(l + " / variant, qty 2", o, () -> h.customer.notifyCustomerGift(o, "Килимок <XL>", "Чорний", 2));
            h.scene(l + " / no variant, qty 1", o, () -> h.customer.notifyCustomerGift(o, "Стікери", null, 1));
            h.scene(l + " / blank variant, null title", o, () -> h.customer.notifyCustomerGift(o, null, " ", 1));
        });
        h.assertSnapshot("notifyCustomerGift");
    }

    @Test
    void notifyCustomerGiftCase() throws Exception {
        h.eachLang("", (l, tg) -> {
            Order paid = order(tg, OrderStatus.APPROVED);
            paid.setGiftCaseStatus("SEALED");
            paid.setPaid(true);
            h.scene(l + " / openable", paid, () -> h.customer.notifyCustomerGiftCase(paid));
            Order unpaid = order(tg, OrderStatus.NEW);
            unpaid.setGiftCaseStatus("SEALED");
            h.scene(l + " / after payment", unpaid, () -> h.customer.notifyCustomerGiftCase(unpaid));
        });
        h.assertSnapshot("notifyCustomerGiftCase");
    }

    @Test
    void notifyCustomerCasePromo() throws Exception {
        h.eachLang("", (l, tg) -> {
            Order o = order(tg, OrderStatus.APPROVED);
            h.scene(l + " / percent", o, () -> h.customer.notifyCustomerCasePromo(o, "CASE-ABC123", 10, 0, UNTIL));
            h.scene(l + " / amount", o, () -> h.customer.notifyCustomerCasePromo(o, "CASE-XYZ<1>", 0, 15_000, UNTIL));
            h.scene(l + " / no expiry", o, () -> h.customer.notifyCustomerCasePromo(o, "CASE-NOEXP", 5, 0, null));
            h.scene(l + " / blank code → nothing", o, () -> h.customer.notifyCustomerCasePromo(o, " ", 5, 0, UNTIL));
        });
        h.props.setWebappBaseUrl("http://localhost:3001");
        Order o = order(NotifyHarness.TG_UK, OrderStatus.APPROVED);
        h.scene("webapp url not https → no button", o, () -> h.customer.notifyCustomerCasePromo(o, "CASE-ABC123", 10, 0, UNTIL));
        h.assertSnapshot("notifyCustomerCasePromo");
    }

    @Test
    void notifyCustomerCasePromoExpiring() throws Exception {
        h.eachLang("", (l, tg) -> {
            Order o = order(tg, OrderStatus.APPROVED);
            h.scene(l + " / percent", o, () -> h.customer.notifyCustomerCasePromoExpiring(o, "CASE-ABC123", 10, 0, UNTIL));
            h.scene(l + " / amount", o, () -> h.customer.notifyCustomerCasePromoExpiring(o, "CASE-XYZ", 0, 15_000, UNTIL));
            h.scene(l + " / no expiry → false", o, () -> h.customer.notifyCustomerCasePromoExpiring(o, "CASE-NOEXP", 5, 0, null));
            h.scene(l + " / null code → false", o, () -> h.customer.notifyCustomerCasePromoExpiring(o, null, 5, 0, UNTIL));
        });
        Order noTg = order(null, OrderStatus.APPROVED);
        h.scene("no telegram → false", noTg, () -> h.customer.notifyCustomerCasePromoExpiring(noTg, "CASE-ABC123", 10, 0, UNTIL));
        h.failure = call -> new TelegramApiException("Forbidden: bot was blocked by the user");
        Order blocked = order(NotifyHarness.TG_UK, OrderStatus.APPROVED);
        h.scene("telegram fails → false", blocked, () -> h.customer.notifyCustomerCasePromoExpiring(blocked, "CASE-ABC123", 10, 0, UNTIL));
        h.assertSnapshot("notifyCustomerCasePromoExpiring");
    }

    @Test
    void notifyCustomerDiscount() throws Exception {
        h.eachLang("", (l, tg) -> {
            Order o = order(tg, OrderStatus.APPROVED);
            h.scene(l, o, () -> h.customer.notifyCustomerDiscount(o));
        });
        h.assertSnapshot("notifyCustomerDiscount");
    }

    @Test
    void notifyCustomerOrderChanged() throws Exception {
        h.eachLang("", (l, tg) -> {
            Order o = order(tg, OrderStatus.APPROVED);
            h.scene(l, o, () -> h.customer.notifyCustomerOrderChanged(o));
        });
        h.assertSnapshot("notifyCustomerOrderChanged");
    }

    @Test
    void notifyCustomerExchange() throws Exception {
        h.eachLang("", (l, tg) -> {
            Order plain = order(tg, OrderStatus.APPROVED);
            h.scene(l + " / nothing to pay", plain, () -> h.customer.notifyCustomerExchange(plain, "Lamzu <Atlantis> × 1"));
            Order cod = order(tg, OrderStatus.APPROVED);
            cod.setReceivedMinor(500_000);
            h.scene(l + " / COD difference", cod, () -> h.customer.notifyCustomerExchange(cod, null));
            Order replacement = order(tg, OrderStatus.APPROVED);
            replacement.setExchangeOfOrderId(UuidUtil.toBytes("11111111-2222-4333-8444-555555555555"));
            h.scene(l + " / replacement, pay online or COD", replacement,
                    () -> h.customer.notifyCustomerExchange(replacement, "Pulsar × 1"));
            Order replacementPaid = order(tg, OrderStatus.APPROVED);
            replacementPaid.setExchangeOfOrderId(UuidUtil.toBytes("11111111-2222-4333-8444-555555555555"));
            replacementPaid.setPaid(true);
            replacementPaid.setReceivedMinor(replacementPaid.getTotalMinor());
            h.scene(l + " / replacement, fully paid", replacementPaid,
                    () -> h.customer.notifyCustomerExchange(replacementPaid, "Pulsar × 1"));
        });
        h.assertSnapshot("notifyCustomerExchange");
    }

    @Test
    void notifyCustomerMerged() throws Exception {
        h.eachLang("", (l, tg) -> {
            Order paidMore = order(tg, OrderStatus.APPROVED);
            paidMore.setPaid(true);
            paidMore.setReceivedMinor(400_000);
            h.scene(l + " / paid, difference left", paidMore, () -> h.customer.notifyCustomerMerged(paidMore, "deadbeef"));
            Order online = order(tg, OrderStatus.APPROVED);
            online.setPrepaymentMinor(300_000);
            online.setReceivedMinor(100_000);
            h.scene(l + " / prepayment still due", online, () -> h.customer.notifyCustomerMerged(online, "deadbeef"));
            Order cod = order(tg, OrderStatus.APPROVED);
            h.scene(l + " / COD", cod, () -> h.customer.notifyCustomerMerged(cod, "deadbeef"));
            Order done = order(tg, OrderStatus.APPROVED);
            done.setPaid(true);
            done.setReceivedMinor(done.getTotalMinor());
            h.scene(l + " / fully paid", done, () -> h.customer.notifyCustomerMerged(done, "deadbeef"));
        });
        h.assertSnapshot("notifyCustomerMerged");
    }

    @Test
    void notifyCustomerReturn() throws Exception {
        h.eachLang("", (l, tg) -> {
            Order o = order(tg, OrderStatus.APPROVED);
            h.scene(l + " / items and refund", o, () -> h.customer.notifyCustomerReturn(o, "Lamzu <Atlantis> × 1", 459_000));
            h.scene(l + " / nothing else", o, () -> h.customer.notifyCustomerReturn(o, " ", 0));
        });
        h.assertSnapshot("notifyCustomerReturn");
    }

    @Test
    void notifyCustomerTracking() throws Exception {
        h.eachLang("", (l, tg) -> {
            Order o = order(tg, OrderStatus.SHIPPED);
            o.setTrackingNumber("2045<01>23456789");
            h.scene(l, o, () -> h.customer.notifyCustomerTracking(o));
            Order none = order(tg, OrderStatus.SHIPPED);
            h.scene(l + " / no tracking number → nothing", none, () -> h.customer.notifyCustomerTracking(none));
        });
        h.assertSnapshot("notifyCustomerTracking");
    }

    @Test
    void onAdminChatMessage() throws Exception {
        h.eachLang("", (l, tg) -> {
            Order o = order(tg, OrderStatus.APPROVED);
            h.scene(l + " / text", o, () -> h.customer.onAdminChatMessage(o, "Відправили <сьогодні>"));
            h.scene(l + " / long text (160)", o, () -> h.customer.onAdminChatMessage(o, "я".repeat(200)));
            h.scene(l + " / photo preview", o, () -> h.customer.onAdminChatMessage(o, "📷 Фото"));
            h.scene(l + " / file preview", o, () -> h.customer.onAdminChatMessage(o, "📎 Файл"));
            h.scene(l + " / no preview", o, () -> h.customer.onAdminChatMessage(o, null));
        });
        h.assertSnapshot("onAdminChatMessage");
    }

    @Test
    void notifyCustomerCancelRequest() throws Exception {
        h.eachLang("", (l, tg) -> {
            Order o = order(tg, OrderStatus.APPROVED);
            o.setReceivedMinor(500_000);
            o.setCancelRequestAdminComment("Вже <відправлено>");
            h.scene(l + " / approved", o, () -> h.customer.notifyCustomerCancelRequest(o, true));
            h.scene(l + " / declined", o, () -> h.customer.notifyCustomerCancelRequest(o, false));
        });
        h.assertSnapshot("notifyCustomerCancelRequest");
    }

    @Test
    void onPaymentReceived() throws Exception {
        h.eachLang("", (l, tg) -> {
            Order part = order(tg, OrderStatus.NEW);
            part.setReceivedMinor(300_000);
            h.scene(l + " / part paid, COD left", part, () -> h.onPaymentReceived(part, 300_000));
            Order full = order(tg, OrderStatus.NEW);
            full.setPaid(true);
            full.setReceivedMinor(full.getTotalMinor());
            h.scene(l + " / paid in full", full, () -> h.onPaymentReceived(full, full.getTotalMinor()));
        });
        Order noTg = order(null, OrderStatus.NEW);
        noTg.setReceivedMinor(300_000);
        h.scene("no telegram → admins only", noTg, () -> h.onPaymentReceived(noTg, 300_000));
        h.props.getTelegram().setNotifyChatId("0");
        Order zero = order(NotifyHarness.TG_RU, OrderStatus.NEW);
        h.scene("admin chat \"0\" → admins skipped, customer notified", zero, () -> h.onPaymentReceived(zero, 100_000));
        h.props.getTelegram().setNotifyChatId(null);
        h.scene("admin chat unset → admins skipped, customer notified", zero, () -> h.onPaymentReceived(zero, 100_000));
        h.assertSnapshot("onPaymentReceived");
    }

    @Test
    void sendReceipt() throws Exception {
        byte[] pdf = new byte[]{1, 2, 3, 4, 5};
        h.eachLang("", (l, tg) -> {
            for (ReceiptKind kind : ReceiptKind.values()) {
                Order o = order(tg, OrderStatus.APPROVED);
                h.scene(l + " / " + kind + " with tax link", o,
                        () -> h.receipts.send(o, pdf, kind, "https://cabinet.example.test/check?id=1&x=\"2\""));
            }
            Order o = order(tg, OrderStatus.APPROVED);
            h.scene(l + " / no tax link", o, () -> h.receipts.send(o, pdf, ReceiptKind.BANK, null));
            h.scene(l + " / http tax link is not printed", o, () -> h.receipts.send(o, pdf, ReceiptKind.BANK, "http://x.test/1"));
        });
        Order o = order(NotifyHarness.TG_UK, OrderStatus.APPROVED);
        h.scene("empty pdf → FAILED", o, () -> h.receipts.send(o, new byte[0], ReceiptKind.BANK, null));
        h.scene("null pdf → FAILED", o, () -> h.receipts.send(o, null, ReceiptKind.BANK, null));
        Order noTg = order(null, OrderStatus.APPROVED);
        h.scene("no telegram → FAILED", noTg, () -> h.receipts.send(noTg, pdf, ReceiptKind.BANK, null));
        for (String why : new String[]{"Forbidden: bot was blocked by the user", "Forbidden: user is deactivated",
                "Bad Request: chat not found", "Forbidden: bot can't initiate conversation with a user",
                "Bad Gateway"}) {
            h.failure = call -> new TelegramApiException(why);
            h.scene("telegram says: " + why, o, () -> h.receipts.send(o, pdf, ReceiptKind.BANK, null));
        }
        h.assertSnapshot("sendReceipt");
    }

    // ---------------- guards ----------------

    @Test
    void guardsCustomerMethods() throws Exception {
        String[] states = {"bot off (token null)", "bot off (token blank)", "tgUserId null", "tgUserId 0", "tgUserId -5"};
        for (String state : states) {
            Long tg = switch (state) {
                case "tgUserId null" -> null;
                case "tgUserId 0" -> 0L;
                case "tgUserId -5" -> -5L;
                default -> NotifyHarness.TG_UK;
            };
            h.props.getTelegram().setBotToken("test-token");
            if (state.equals("bot off (token null)")) {
                h.props.getTelegram().setBotToken(null);
            } else if (state.equals("bot off (token blank)")) {
                h.props.getTelegram().setBotToken("  ");
            }
            Order o = order(tg, OrderStatus.SHIPPED);
            o.setTrackingNumber("123");
            o.setReceivedMinor(100_000);
            byte[] pdf = {1};
            h.scene(state + " / notifyCustomerStatus", o, () -> h.customer.notifyCustomerStatus(o));
            h.scene(state + " / notifyCustomerGift", o, () -> h.customer.notifyCustomerGift(o, "T", null, 1));
            h.scene(state + " / notifyCustomerGiftCase", o, () -> h.customer.notifyCustomerGiftCase(o));
            h.scene(state + " / notifyCustomerCasePromo", o, () -> h.customer.notifyCustomerCasePromo(o, "C", 5, 0, UNTIL));
            h.scene(state + " / notifyCustomerCasePromoExpiring", o, () -> h.customer.notifyCustomerCasePromoExpiring(o, "C", 5, 0, UNTIL));
            h.scene(state + " / notifyCustomerDiscount", o, () -> h.customer.notifyCustomerDiscount(o));
            h.scene(state + " / notifyCustomerOrderChanged", o, () -> h.customer.notifyCustomerOrderChanged(o));
            h.scene(state + " / notifyCustomerExchange", o, () -> h.customer.notifyCustomerExchange(o, "x"));
            h.scene(state + " / notifyCustomerMerged", o, () -> h.customer.notifyCustomerMerged(o, "deadbeef"));
            h.scene(state + " / notifyCustomerReturn", o, () -> h.customer.notifyCustomerReturn(o, "x", 1));
            h.scene(state + " / notifyCustomerTracking", o, () -> h.customer.notifyCustomerTracking(o));
            h.scene(state + " / onAdminChatMessage", o, () -> h.customer.onAdminChatMessage(o, "hi"));
            h.scene(state + " / notifyCustomerCancelRequest", o, () -> h.customer.notifyCustomerCancelRequest(o, true));
            h.scene(state + " / sendReceipt", o, () -> h.receipts.send(o, pdf, ReceiptKind.BANK, null));
            h.scene(state + " / onPaymentReceived", o, () -> h.onPaymentReceived(o, 100_000));
            h.scene(state + " / onNewOrder", o, () -> h.seller.onNewOrder(o));
            h.scene(state + " / onStatusChanged", o, () -> h.seller.onStatusChanged(o));
            h.scene(state + " / onCustomerChatMessage", o, () -> h.seller.onCustomerChatMessage(o, "hi"));
            h.scene(state + " / onCancelRequested", o, () -> h.seller.onCancelRequested(o));
            h.scene(state + " / postDispatchCard", o, () -> h.seller.postDispatchCard(o));
            h.scene(state + " / syncDispatchCard", o, () -> h.seller.syncDispatchCard(o));
            h.scene(state + " / isBotEnabled", null, () -> h.receipts.isBotEnabled());
        }
        h.assertSnapshot("guardsCustomerMethods");
    }

    @Test
    void guardsAdminChat() throws Exception {
        String[] chats = {null, "", "  ", "0", " 0 ", "@maxsolch_chat"};
        for (String chat : chats) {
            h.props.getTelegram().setNotifyChatId(chat);
            String label = "admin chat " + (chat == null ? "null" : "'" + chat + "'");
            Order o = order(null, OrderStatus.APPROVED);
            o.setReceivedMinor(100_000);
            o.setCancelRequestReason("r");
            h.scene(label + " / onNewOrder", o, () -> h.seller.onNewOrder(o));
            h.scene(label + " / onStatusChanged", o, () -> h.seller.onStatusChanged(o));
            h.scene(label + " / onCustomerChatMessage", o, () -> h.seller.onCustomerChatMessage(o, "hi"));
            h.scene(label + " / onPaymentReceived", o, () -> h.onPaymentReceived(o, 100_000));
            h.scene(label + " / onCancelRequested", o, () -> h.seller.onCancelRequested(o));
            h.scene(label + " / postDispatchCard", o, () -> h.seller.postDispatchCard(o));
            h.scene(label + " / syncDispatchCard", o, () -> h.seller.syncDispatchCard(o));
            h.scene(label + " / removeDispatchCard(900)", null, () -> h.seller.removeDispatchCard(900));
        }
        h.assertSnapshot("guardsAdminChat");
    }

    @Test
    void failuresAreSwallowed() throws Exception {
        h.failure = call -> new TelegramApiException("Bad Gateway");
        Order o = order(NotifyHarness.TG_UK, OrderStatus.APPROVED);
        o.setTrackingNumber("123");
        o.setReceivedMinor(100_000);
        o.setNotifyChatId(CHAT);
        o.setNotifyMessageId(5);
        h.scene("onNewOrder", o, () -> h.seller.onNewOrder(o));
        h.scene("onStatusChanged", o, () -> h.seller.onStatusChanged(o));
        h.scene("notifyCustomerStatus", o, () -> h.customer.notifyCustomerStatus(o));
        h.scene("notifyCustomerGift", o, () -> h.customer.notifyCustomerGift(o, "T", null, 1));
        h.scene("notifyCustomerGiftCase", o, () -> h.customer.notifyCustomerGiftCase(o));
        h.scene("notifyCustomerCasePromo", o, () -> h.customer.notifyCustomerCasePromo(o, "C", 5, 0, UNTIL));
        h.scene("notifyCustomerDiscount", o, () -> h.customer.notifyCustomerDiscount(o));
        h.scene("notifyCustomerOrderChanged", o, () -> h.customer.notifyCustomerOrderChanged(o));
        h.scene("notifyCustomerExchange", o, () -> h.customer.notifyCustomerExchange(o, "x"));
        h.scene("notifyCustomerMerged", o, () -> h.customer.notifyCustomerMerged(o, "deadbeef"));
        h.scene("notifyCustomerReturn", o, () -> h.customer.notifyCustomerReturn(o, "x", 1));
        h.scene("notifyCustomerTracking", o, () -> h.customer.notifyCustomerTracking(o));
        h.scene("onAdminChatMessage", o, () -> h.customer.onAdminChatMessage(o, "hi"));
        h.scene("onCustomerChatMessage", o, () -> h.seller.onCustomerChatMessage(o, "hi"));
        h.scene("onPaymentReceived", o, () -> h.onPaymentReceived(o, 100_000));
        h.scene("onCancelRequested", o, () -> h.seller.onCancelRequested(o));
        h.scene("notifyCustomerCancelRequest", o, () -> h.customer.notifyCustomerCancelRequest(o, false));
        h.scene("postDispatchCard", o, () -> h.seller.postDispatchCard(o));
        h.scene("syncDispatchCard", o, () -> h.seller.syncDispatchCard(o));
        h.assertSnapshot("failuresAreSwallowed");
    }

    @Test
    void isBotEnabled() {
        org.assertj.core.api.Assertions.assertThat(h.receipts.isBotEnabled()).isTrue();
        h.props.getTelegram().setBotToken(" ");
        org.assertj.core.api.Assertions.assertThat(h.receipts.isBotEnabled()).isFalse();
        h.props.getTelegram().setBotToken(null);
        org.assertj.core.api.Assertions.assertThat(h.receipts.isBotEnabled()).isFalse();
    }
}
