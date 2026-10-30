package com.maxsolch.shop.notification.app;

import com.maxsolch.shop.staff.app.AdminSecurityNotifier;
import com.maxsolch.shop.staff.domain.AdminInvite;
import com.maxsolch.shop.staff.app.AdminSessions;
import com.maxsolch.shop.staff.domain.LoginMethod;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.translation.app.BotTexts;
import com.maxsolch.shop.support.app.AdminBadge;
import com.maxsolch.shop.preorder.domain.PreorderEvents;
import com.maxsolch.shop.procurement.app.BatchDtos.EtaDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.MyPreorderDto;
import com.maxsolch.shop.preorder.app.PreorderNotifier;
import com.maxsolch.shop.preorder.app.PreorderQueueReader;
import com.maxsolch.shop.staff.infra.AdminUserRepository;
import com.maxsolch.shop.review.app.ReviewNotifier;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.support.domain.SupportEvents;
import com.maxsolch.shop.support.app.SupportNotifier;
import com.maxsolch.shop.support.domain.SupportThread;
import com.maxsolch.shop.support.infra.SupportThreadRepository;
import com.maxsolch.shop.translation.app.TranslationService;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.telegram.telegrambots.meta.api.objects.CallbackQuery;
import org.telegram.telegrambots.meta.api.objects.Chat;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.User;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

/**
 * Characterization of the four small notifiers that talk to Telegram next to the order notifiers:
 * support, reviews, pre-orders and the admin's own security alerts. Text, chat, topic, keyboard, journal
 * entry and the «nothing is sent» guards, for a uk / ru / en customer. The snapshots in
 * {@code src/test/resources/snapshots/notify} (files {@code support*}, {@code review*}, {@code preorder*},
 * {@code adminSecurity*}) were written from the code before the notifiers moved onto CustomerBot /
 * SellerChannel and must not change.
 */
class NotifiersSnapshotTest {

    private static final Instant AT = Instant.parse("2026-11-12T15:00:00Z");
    private static final byte[] THREAD = UuidUtil.toBytes("7e57ab1e-0000-4000-8000-0000000000aa");
    private static final String PRODUCT = "79c3e54e-0000-4000-8000-000000000001";

    private final NotifyHarness h = new NotifyHarness();

    private final AdminPushService push = Mockito.mock(AdminPushService.class);
    /** No inbox total unless a test says so: the push goes without a badge, as before. */
    private final AdminBadge inbox = Mockito.mock(AdminBadge.class, call -> {
        throw new IllegalStateException("no inbox");
    });
    private final SupportThreadRepository threads = Mockito.mock(SupportThreadRepository.class);
    private final PreorderQueueReader queue = Mockito.mock(PreorderQueueReader.class);
    private final AdminSessions sessions = Mockito.mock(AdminSessions.class);
    private final AdminUserRepository adminUsers = Mockito.mock(AdminUserRepository.class);
    private final AdminAuditService audit = Mockito.mock(AdminAuditService.class);

    // ---- the only place that changes when a notifier constructor does ----

    private SupportNotifier support() {
        doAnswer(inv -> {
            ((Runnable) inv.getArgument(0)).run();
            return null;
        }).when(push).runAsync(any());
        doAnswer(inv -> {
            h.record("Push " + inv.getArgument(0));
            return null;
        }).when(push).notifyAdmins(any());
        return new SupportNotifier(customerBot(), sellerChannel(), h.messages, push, inbox, threads);
    }

    private ReviewNotifier review() {
        doAnswer(inv -> {
            h.record("Push " + inv.getArgument(0));
            return null;
        }).when(push).notifyAdmins(any());
        return new ReviewNotifier(customerBot(), h.messages, push, new com.maxsolch.shop.platform.time.ShopZone("Europe/Kyiv"));
    }

    private PreorderNotifier preorder() {
        BotTexts texts = new BotTexts(h.messages, Mockito.mock(SettingsService.class), Mockito.mock(TranslationService.class), new org.springframework.cache.concurrent.ConcurrentMapCacheManager());
        return new PreorderNotifier(queue, customerBot(), texts, new com.maxsolch.shop.platform.time.ShopZone("Europe/Kyiv"));
    }

    private AdminSecurityNotifier adminSecurity() {
        return new AdminSecurityNotifier(h.bot, sellerChannel(), new com.maxsolch.shop.platform.time.ShopZone("Europe/Kyiv"), sessions, adminUsers, audit, new com.maxsolch.shop.platform.jobs.Workers());
    }

    private CustomerBot customerBot() {
        return new CustomerBot(h.bot, h.props, h.messages, h.activity);
    }

    private SellerChannel sellerChannel() {
        return new SellerChannel(h.bot, h.props, h.activity);
    }

    // ---------------- support ----------------

    private SupportThread thread(Long tgUserId, String customer, String product) {
        SupportThread t = new SupportThread();
        t.setId(THREAD);
        t.setTgUserId(tgUserId);
        t.setCustomerName(customer);
        t.setProductTitle(product);
        doReturn(Optional.of(t)).when(threads).findById(THREAD);
        return t;
    }

    @Test
    void supportAdminReplyToCustomer() throws Exception {
        SupportNotifier n = support();
        h.eachLang("reply with product and preview", (label, id) -> {
            thread(id, "Іван", "Lamzu <Atlantis> " + "x".repeat(130));
            h.scene(label, null, () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, true, false,
                    "Дякуємо <за> питання " + "ы".repeat(320))));
        });
        h.eachLang("photo placeholder, no product", (label, id) -> {
            thread(id, "Іван", null);
            h.scene(label, null, () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, true, false, "📷 Фото")));
        });
        thread(NotifyHarness.TG_UK, "Іван", "  ");
        h.scene("blank product, file placeholder", null,
                () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, true, false, "📎 Файл")));
        h.scene("no preview", null, () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, true, false, null)));
        h.scene("blank preview", null, () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, true, false, "   ")));
        h.props.setWebappBaseUrl("http://localhost:3000");
        h.scene("web app url not https: no button", null,
                () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, true, false, "hi")));
        h.props.setWebappBaseUrl("https://app.example.test");
        h.assertSnapshot("supportAdminReplyToCustomer");
    }

    @Test
    void supportGuardsAndFailures() throws Exception {
        SupportNotifier n = support();
        for (Long tg : new Long[]{null, 0L, -5L}) {
            thread(tg, "Іван", "Товар");
            h.scene("reply, tg_user_id=" + tg, null, () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, true, false, "hi")));
        }
        thread(NotifyHarness.TG_UK, "Іван", "Товар");
        h.props.getTelegram().setBotToken("");
        h.scene("reply, bot token blank", null, () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, true, false, "hi")));
        h.scene("customer wrote, bot token blank: push only", null,
                () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, false, true, "hi")));
        h.props.getTelegram().setBotToken(null);
        h.scene("reply, bot token null", null, () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, true, false, "hi")));
        h.props.getTelegram().setBotToken("test-token");
        doReturn(Optional.empty()).when(threads).findById(THREAD);
        h.scene("thread not found", null, () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, true, false, "hi")));
        doThrow(new IllegalStateException("db down")).when(threads).findById(THREAD);
        h.scene("thread lookup throws", null, () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, true, false, "hi")));
        thread(NotifyHarness.TG_UK, "Іван", "Товар");
        h.failure = call -> new TelegramApiException("Forbidden: bot was blocked by the user");
        h.scene("reply, Telegram fails: swallowed, journaled", null,
                () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, true, false, "hi")));
        h.scene("customer wrote, Telegram fails: swallowed, push still goes", null,
                () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, false, false, "hi")));
        h.failure = call -> null;
        h.assertSnapshot("supportGuardsAndFailures");
    }

    @Test
    void supportCustomerWroteToAdmins() throws Exception {
        SupportNotifier n = support();
        thread(NotifyHarness.TG_UK, "Іван <Петренко>", "Lamzu <Atlantis> " + "x".repeat(130));
        h.scene("new thread about a product, badge lookup fails", null,
                () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, false, true, "Є <в> наявності? " + "ы".repeat(320))));
        thread(NotifyHarness.TG_RU, null, null);
        h.scene("new message, no name, general question", null,
                () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, false, false, "Привет")));
        h.scene("no preview", null, () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, false, false, null)));
        h.scene("blank preview", null, () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, false, false, " ")));
        h.props.getTelegram().setNotifyTopicChat(0);
        h.scene("chat topic 0", null, () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, false, false, "hi")));
        h.props.getTelegram().setNotifyTopicChat(16);
        h.props.setAdminBaseUrl("http://localhost:3000");
        h.scene("admin url not https: no button", null,
                () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, false, false, "hi")));
        h.props.setAdminBaseUrl("https://admin.example.test");
        for (String chat : new String[]{null, "", "  ", "0", " 0 ", "@channel", "-100777"}) {
            h.props.getTelegram().setNotifyChatId(chat);
            h.scene("admin chat '" + chat + "'", null, () -> n.onMessage(new SupportEvents.MessagePosted(THREAD, false, true, "hi")));
        }
        h.assertSnapshot("supportCustomerWroteToAdmins");
    }

    // ---------------- reviews ----------------

    @Test
    void reviewBonusAndReminders() throws Exception {
        ReviewNotifier n = review();
        Instant until = Instant.parse("2026-12-01T10:00:00Z");
        byte[] order = UuidUtil.toBytes("1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9");
        h.eachLang("bonusIssued, no ceiling", (label, id) ->
                h.scene(label, null, () -> n.bonusIssued(id, "REV-<AB>12", 5, 0, until)));
        h.eachLang("bonusIssued, ceiling 100 UAH", (label, id) ->
                h.scene(label, null, () -> n.bonusIssued(id, "REV-AB12", 5, 10_000, until)));
        h.eachLang("reminder with bonus", (label, id) ->
                h.scene(label, null, () -> n.reminder(id, order, 5, 0)));
        h.eachLang("reminder with capped bonus", (label, id) ->
                h.scene(label, null, () -> n.reminder(id, order, 7, 15_000)));
        h.eachLang("reminder without bonus", (label, id) ->
                h.scene(label, null, () -> n.reminder(id, order, 0, 0)));
        h.eachLang("bonusExpiring", (label, id) ->
                h.scene(label, null, () -> n.bonusExpiring(id, "REV-AB12", 5, 0, until)));
        h.eachLang("bonusExpiring capped", (label, id) ->
                h.scene(label, null, () -> n.bonusExpiring(id, "REV-AB12", 5, 10_000, until)));
        h.props.setWebappBaseUrl("http://localhost:3000");
        h.scene("web app url not https: no button", null, () -> n.bonusIssued(NotifyHarness.TG_UK, "C", 5, 0, until));
        h.scene("web app url not https: reminder", null, () -> n.reminder(NotifyHarness.TG_UK, order, 5, 0));
        h.props.setWebappBaseUrl("https://app.example.test");
        h.assertSnapshot("reviewBonusAndReminders");
    }

    @Test
    void reviewGuardsAndFailures() throws Exception {
        ReviewNotifier n = review();
        Instant until = Instant.parse("2026-12-01T10:00:00Z");
        byte[] order = UuidUtil.toBytes("1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9");
        for (Long tg : new Long[]{null, 0L, -5L}) {
            h.scene("tg_user_id=" + tg, null, () -> List.of(
                    n.reminder(tg, order, 5, 0), n.bonusExpiring(tg, "C", 5, 0, until)));
            h.scene("bonusIssued tg_user_id=" + tg, null, () -> n.bonusIssued(tg, "C", 5, 0, until));
        }
        h.props.getTelegram().setBotToken(" ");
        h.scene("bot token blank", null, () -> List.of(n.enabled(), n.reminder(NotifyHarness.TG_UK, order, 5, 0),
                n.bonusExpiring(NotifyHarness.TG_UK, "C", 5, 0, until)));
        h.scene("bot token blank: bonusIssued", null, () -> n.bonusIssued(NotifyHarness.TG_UK, "C", 5, 0, until));
        h.props.getTelegram().setBotToken("test-token");
        h.failure = call -> new TelegramApiException("Forbidden: bot was blocked by the user");
        h.scene("Telegram fails: false, journaled", null, () -> List.of(
                n.reminder(NotifyHarness.TG_UK, order, 5, 0), n.bonusExpiring(NotifyHarness.TG_UK, "C", 5, 0, until)));
        h.scene("Telegram fails: bonusIssued", null, () -> n.bonusIssued(NotifyHarness.TG_UK, "C", 5, 0, until));
        h.failure = call -> null;
        h.scene("push: moderation, 3 stars", null, () -> n.pendingForModeration("Lamzu <Atlantis>", 3, 4));
        h.scene("push: rating out of range, long title, huge count", null,
                () -> n.pendingForModeration("т".repeat(120), 9, Long.MAX_VALUE));
        h.scene("push: null title, rating 0", null, () -> n.pendingForModeration(null, 0, 1));
        doThrow(new IllegalStateException("push down")).when(push).notifyAdmins(any());
        h.scene("push fails: swallowed", null, () -> n.pendingForModeration("x", 5, 1));
        h.assertSnapshot("reviewGuardsAndFailures");
    }

    // ---------------- pre-orders ----------------

    private void place(long userId, String status, int qty, Integer position, int heldQty, Instant holdUntil,
                       EtaDto eta, String title, String variant) {
        MyPreorderDto p = new MyPreorderDto(7, PRODUCT, null, title, "mchose-ace-68", null, variant, qty,
                status, position, heldQty, holdUntil, Instant.parse("2026-10-27T10:00:00Z"), eta);
        doReturn(userId).when(queue).ownerOf(7L);
        doReturn(Optional.of(new PreorderQueueReader.Described(userId, p, 719900))).when(queue).describe(eq(7L), any());
    }

    private void place(long userId, String status, int qty, Integer position, int heldQty, Instant holdUntil, EtaDto eta) {
        place(userId, status, qty, position, heldQty, holdUntil, eta, "MCHOSE <Ace> 68", "Black & White");
    }

    @Test
    void preorderQueueMessages() throws Exception {
        PreorderNotifier n = preorder();
        EtaDto range = new EtaDto("in_transit", "RANGE", LocalDate.of(2026, 11, 10), LocalDate.of(2026, 11, 20), null, null);
        h.eachLang("subscribed, range", (label, id) -> {
            place(id, "WAITING", 2, 3, 0, null, range);
            h.scene(label, null, () -> n.onSubscribed(new PreorderEvents.Subscribed(7)));
        });
        h.eachLang("subscribed, no batch", (label, id) -> {
            place(id, "WAITING", 1, 1, 0, null, null);
            h.scene(label, null, () -> n.onSubscribed(new PreorderEvents.Subscribed(7)));
        });
        place(NotifyHarness.TG_UK, "WAITING", 1, null, 0, null, new EtaDto("ordered", "DATE", LocalDate.of(2026, 11, 10), null, null, null));
        h.scene("subscribed, date, no position", null, () -> n.onSubscribed(new PreorderEvents.Subscribed(7)));
        for (EtaDto e : new EtaDto[]{
                new EtaDto("ordered", "APPROX", null, null, 2, null),
                new EtaDto("ordered", "APPROX", null, null, 0, null),
                new EtaDto("ordered", "APPROX", null, null, null, null),
                new EtaDto("ordered", "HIDDEN", null, null, null, null),
                new EtaDto("ordered", "DATE", null, null, null, null),
                new EtaDto("ordered", "RANGE", LocalDate.of(2026, 11, 10), null, null, null),
                new EtaDto("ordered", "OTHER", null, null, null, null)}) {
            place(NotifyHarness.TG_RU, "WAITING", 1, 2, 0, null, e);
            h.scene("subscribed, eta mode " + e.mode() + " weeks=" + e.approxWeeks(), null,
                    () -> n.onSubscribed(new PreorderEvents.Subscribed(7)));
        }
        place(NotifyHarness.TG_UK, "WAITING", 1, 2, 0, null, null, null, null);
        h.scene("subscribed, null title", null, () -> n.onSubscribed(new PreorderEvents.Subscribed(7)));
        place(NotifyHarness.TG_UK, "WAITING", 1, 2, 0, null, null, "Ace", "  ");
        h.scene("subscribed, blank variant", null, () -> n.onSubscribed(new PreorderEvents.Subscribed(7)));

        h.eachLang("hold granted, partial", (label, id) -> {
            place(id, "HELD", 3, null, 2, AT, null);
            h.scene(label, null, () -> n.onHoldGranted(new PreorderEvents.HoldGranted(7)));
        });
        place(NotifyHarness.TG_EN, "HELD", 2, null, 2, AT, null);
        h.scene("hold granted, full", null, () -> n.onHoldGranted(new PreorderEvents.HoldGranted(7)));
        place(NotifyHarness.TG_EN, "HELD", 2, null, 2, null, null);
        h.scene("hold granted, no hold time", null, () -> n.onHoldGranted(new PreorderEvents.HoldGranted(7)));
        h.eachLang("arrived", (label, id) -> {
            place(id, "WAITING", 1, 1, 0, null, null);
            h.scene(label, null, () -> n.onArrived(new PreorderEvents.ArrivedNotice(7)));
        });
        h.eachLang("hold ending", (label, id) -> {
            place(id, "HELD", 1, null, 1, AT, null);
            h.scene(label, null, () -> n.onHoldEnding(new PreorderEvents.HoldEnding(7)));
        });
        h.eachLang("hold expired", (label, id) -> {
            place(id, "EXPIRED", 1, null, 0, null, null);
            h.scene(label, null, () -> n.onHoldExpired(new PreorderEvents.HoldExpired(7)));
        });
        h.eachLang("still waiting", (label, id) -> {
            place(id, "WAITING", 1, 4, 0, null, null);
            h.scene(label, null, () -> n.onStillWaiting(new PreorderEvents.StillWaiting(7, 4)));
        });
        h.eachLang("closed, batch cancelled", (label, id) -> {
            place(id, "CANCELLED", 1, null, 0, null, null);
            h.scene(label, null, () -> n.onClosed(new PreorderEvents.Closed(7, "BATCH_CANCELLED")));
        });
        place(NotifyHarness.TG_UK, "CANCELLED", 1, null, 0, null, null);
        for (String reason : new String[]{"PRODUCT_GONE", "BY_USER", null}) {
            h.scene("closed, reason " + reason, null, () -> n.onClosed(new PreorderEvents.Closed(7, reason)));
        }
        h.eachLang("batch cancelled, kept", (label, id) -> {
            place(id, "WAITING", 1, 1, 0, null, null);
            h.scene(label, null, () -> n.onBatchCancelledKept(new PreorderEvents.BatchCancelledKept(7)));
        });
        h.props.setWebappBaseUrl("http://localhost:3000");
        h.scene("web app url not https: no button", null, () -> n.onBatchCancelledKept(new PreorderEvents.BatchCancelledKept(7)));
        h.props.setWebappBaseUrl("https://app.example.test");
        h.assertSnapshot("preorderQueueMessages");
    }

    @Test
    void preorderGuardsAndFailures() throws Exception {
        PreorderNotifier n = preorder();
        place(NotifyHarness.TG_UK, "WAITING", 1, 1, 0, null, null);
        h.props.getTelegram().setBotToken("");
        h.scene("bot token blank", null, () -> n.onArrived(new PreorderEvents.ArrivedNotice(7)));
        h.props.getTelegram().setBotToken("test-token");
        for (Long owner : new Long[]{null, 0L, -3L}) {
            doReturn(owner).when(queue).ownerOf(7L);
            h.scene("owner " + owner, null, () -> n.onArrived(new PreorderEvents.ArrivedNotice(7)));
        }
        doReturn(NotifyHarness.TG_UK).when(queue).ownerOf(7L);
        doReturn(Optional.empty()).when(queue).describe(eq(7L), any());
        h.scene("place not found", null, () -> n.onArrived(new PreorderEvents.ArrivedNotice(7)));
        doThrow(new IllegalStateException("db down")).when(queue).ownerOf(7L);
        h.scene("owner lookup throws", null, () -> n.onArrived(new PreorderEvents.ArrivedNotice(7)));
        doReturn(NotifyHarness.TG_UK).when(queue).ownerOf(7L);
        doThrow(new IllegalStateException("db down")).when(queue).describe(eq(7L), any());
        h.scene("describe throws", null, () -> n.onArrived(new PreorderEvents.ArrivedNotice(7)));
        place(NotifyHarness.TG_UK, "WAITING", 1, 1, 0, null, null);
        h.failure = call -> new TelegramApiException("Forbidden: bot was blocked by the user");
        h.scene("Telegram fails: swallowed, journaled", null, () -> n.onArrived(new PreorderEvents.ArrivedNotice(7)));
        h.failure = call -> null;
        h.assertSnapshot("preorderGuardsAndFailures");
    }

    // ---------------- admin security ----------------

    @Test
    void adminSecurityAlertsAndInvites() throws Exception {
        AdminSecurityNotifier n = adminSecurity();
        for (LoginMethod m : LoginMethod.values()) {
            asyncScene("new device login via " + m, 2,
                    () -> n.newDeviceLogin(900L, m, "Київ <UA>", "Windows · Chrome", "1.2.3.4", AT));
        }
        asyncScene("account locked", 2, () -> n.accountLocked(900L, "Київ", "Windows · Chrome", "1.2.3.4", AT));
        asyncScene("account notice, multi-line html", 2, () -> n.accountNotice(900L, "🔑 <b>2FA сброшена</b>\nВторая строка с IP 1.2.3.4"));
        asyncScene("account notice, null html", 2, () -> n.accountNotice(900L, null));
        for (AdminInvite.Kind k : AdminInvite.Kind.values()) {
            h.scene("invite " + k, null, () -> n.sendInvite(900L, "https://admin.example.test/invite/SECRET-" + k, k,
                    "Менеджер <1>", "Влад & Co", AT));
        }
        h.scene("invite without a link", null, () -> n.sendInvite(900L, null, AdminInvite.Kind.NEW, "r", "i", AT));
        h.scene("invite, telegram id 0", null, () -> n.sendInvite(0L, "https://x", AdminInvite.Kind.NEW, "r", "i", AT));
        h.failure = call -> new TelegramApiException("Forbidden: bot can't initiate conversation with a user");
        h.scene("invite, Telegram fails: false, journaled", null,
                () -> n.sendInvite(900L, "https://x", AdminInvite.Kind.NEW, "r", "i", AT));
        asyncScene("alert, Telegram fails: swallowed, journaled", 2,
                () -> n.accountLocked(900L, "Київ", "Windows · Chrome", "1.2.3.4", AT));
        h.failure = call -> null;
        // guards: nothing is queued at all
        h.scene("alert, admin id 0", null, () -> n.accountLocked(0L, "p", "d", "ip", AT));
        h.scene("notice, admin id -1", null, () -> n.accountNotice(-1L, "x"));
        h.props.getTelegram().setBotToken("");
        h.scene("alert, bot token blank", null, () -> n.accountLocked(900L, "p", "d", "ip", AT));
        h.scene("notice, bot token blank", null, () -> n.accountNotice(900L, "x"));
        h.scene("invite, bot token blank", null, () -> n.sendInvite(900L, "https://x", AdminInvite.Kind.NEW, "r", "i", AT));
        h.props.getTelegram().setBotToken("test-token");
        h.assertSnapshot("adminSecurityAlertsAndInvites");
    }

    @Test
    void adminSecurityBlockButton() throws Exception {
        AdminSecurityNotifier n = adminSecurity();
        when(adminUsers.findById(900L)).thenReturn(Optional.of(new com.maxsolch.shop.staff.domain.AdminUser()));
        when(sessions.revokeEverything(900L)).thenReturn(2);
        h.scene("pressed by the admin, alert text kept", null, () -> n.onCallback(callback(900L, 900L, "asb:900", "🔐 Вход <в> админку"), java.util.Locale.of("ru")));
        h.scene("pressed by the admin, no message", null, () -> n.onCallback(callback(900L, 900L, "asb:900", null), java.util.Locale.of("ru")));
        h.scene("pressed by someone else", null, () -> n.onCallback(callback(901L, 901L, "asb:900", "x"), java.util.Locale.of("ru")));
        h.scene("data is not a number", null, () -> n.onCallback(callback(900L, 900L, "asb:zzz", "x"), java.util.Locale.of("ru")));
        when(adminUsers.findById(900L)).thenReturn(Optional.empty());
        h.scene("admin no longer exists", null, () -> n.onCallback(callback(900L, 900L, "asb:900", "x"), java.util.Locale.of("ru")));
        h.assertSnapshot("adminSecurityBlockButton");
        Mockito.verify(audit, Mockito.times(2)).recordFor(eq(900L), eq("ADMIN_BLOCK_TG"), eq("AUTH"), eq("900"), any());
    }

    private static CallbackQuery callback(long fromId, long chatId, String data, String text) {
        CallbackQuery cq = new CallbackQuery();
        cq.setId("cb-" + data);
        cq.setData(data);
        User from = new User();
        from.setId(fromId);
        cq.setFrom(from);
        if (text != null) {
            Message m = new Message();
            m.setMessageId(55);
            Chat chat = new Chat();
            chat.setId(chatId);
            m.setChat(chat);
            m.setText(text);
            cq.setMessage(m);
        }
        return cq;
    }

    /** The alert goes out on the notifier's own thread: wait for the journal entry and the message. */
    private void asyncScene(String label, int events, Runnable action) {
        h.scene(label, null, () -> {
            action.run();
            h.awaitEvents(events);
        });
    }
}
