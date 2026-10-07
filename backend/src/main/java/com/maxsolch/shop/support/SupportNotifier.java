package com.maxsolch.shop.support;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.i18n.ChatPreview;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.inbox.InboxService;
import com.maxsolch.shop.journal.ActivityLog;
import com.maxsolch.shop.push.AdminPushService;
import com.maxsolch.shop.push.AdminPushService.PushMessage;
import com.maxsolch.shop.tg.ShopBot;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.api.objects.webapp.WebAppInfo;

import java.util.List;
import java.util.Locale;

import static com.maxsolch.shop.common.Texts.ellipsize;
import static com.maxsolch.shop.common.Texts.escHtml;
import static com.maxsolch.shop.common.Texts.nullToEmpty;

/**
 * Support notifications, after the commit and best-effort (a Telegram or push hiccup never fails
 * the message):
 * <ul>
 *   <li>customer wrote → the admins' chat topic in Telegram ({@code NOTIFY_TOPIC_CHAT}, labelled
 *       «Поддержка» with the product) + an admin Web Push;</li>
 *   <li>admin answered → a bot DM to the customer in their language, with a button that opens the
 *       thread in the Mini App ({@code startapp=support_<threadId>}).</li>
 * </ul>
 * Kept apart from the order {@code NotificationService}: a support thread has no order.
 */
@Slf4j
@Component
public class SupportNotifier {

    private final ShopBot bot;
    private final AppProperties props;
    private final Messages messages;
    private final AdminPushService push;
    private final InboxService inbox;
    private final SupportThreadRepository threads;
    private final ActivityLog activity;

    public SupportNotifier(@Lazy ShopBot bot, AppProperties props, Messages messages, AdminPushService push,
                           @Lazy InboxService inbox, SupportThreadRepository threads, ActivityLog activity) {
        this.activity = activity;
        this.bot = bot;
        this.props = props;
        this.messages = messages;
        this.push = push;
        this.inbox = inbox;
        this.threads = threads;
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void onMessage(SupportEvents.MessagePosted event) {
        SupportThread t;
        try {
            t = threads.findById(event.threadId()).orElse(null);
        } catch (Exception e) {
            log.warn("Support notification: thread lookup failed: {}", e.getMessage());
            return;
        }
        if (t == null) {
            return;
        }
        if (event.fromAdmin()) {
            dmCustomer(t, event.preview());
        } else {
            notifyAdminsTelegram(t, event.preview(), event.newThread());
            notifyAdminsPush(t, event.newThread());
        }
    }

    // ------------------------------------------------------------------ customer

    void dmCustomer(SupportThread t, String preview) {
        if (!botEnabled()) {
            return;
        }
        Long tgUserId = t.getTgUserId();
        if (tgUserId == null || tgUserId <= 0) {
            return;
        }
        try {
            Locale locale = messages.localeOf(tgUserId);
            StringBuilder text = new StringBuilder();
            text.append(messages.get(locale, "bot.support.reply")).append('\n');
            if (t.getProductTitle() != null && !t.getProductTitle().isBlank()) {
                text.append(messages.get(locale, "bot.support.about", escHtml(ellipsize(t.getProductTitle(), 120)))).append('\n');
            }
            if (preview != null && !preview.isBlank()) {
                text.append("<blockquote>").append(escHtml(ellipsize(ChatPreview.localize(preview, locale, messages), 300)))
                        .append("</blockquote>\n");
            }
            text.append(messages.get(locale, "bot.support.cta"));
            SendMessage msg = SendMessage.builder()
                    .chatId(String.valueOf(tgUserId))
                    .text(text.toString())
                    .parseMode("HTML")
                    .replyMarkup(openThreadButton(t, locale))
                    .build();
            activity.bot(ActivityLog.Entry.bot("SUPPORT_REPLY").toCustomer(tgUserId).text(msg.getText())
                    .detail("thread", UuidUtil.toString(t.getId())), () -> bot.execute(msg));
        } catch (Exception e) {
            log.warn("Support DM failed for thread {}: {}", UuidUtil.toString(t.getId()), e.getMessage());
        }
    }

    /** Opens the thread in the Mini App (deep link support_<id>); null until a public HTTPS URL is set. */
    private InlineKeyboardMarkup openThreadButton(SupportThread t, Locale locale) {
        String webapp = props.getWebappBaseUrl();
        if (!isHttps(webapp)) {
            return null;
        }
        InlineKeyboardButton btn = InlineKeyboardButton.builder()
                .text(messages.get(locale, "bot.support.open"))
                .webApp(WebAppInfo.builder()
                        .url(webapp + "?startapp=support_" + UuidUtil.toString(t.getId())).build())
                .build();
        return InlineKeyboardMarkup.builder().keyboard(List.of(List.of(btn))).build();
    }

    // ------------------------------------------------------------------ admins

    void notifyAdminsTelegram(SupportThread t, String preview, boolean newThread) {
        if (!botEnabled()) {
            return;
        }
        String chatId = props.getTelegram().getNotifyChatId();
        if (chatId == null || chatId.isBlank() || "0".equals(chatId.trim())) {
            return;
        }
        try {
            StringBuilder text = new StringBuilder();
            text.append(newThread ? "🛟 <b>Поддержка · новый вопрос</b>\n" : "🛟 <b>Поддержка · новое сообщение</b>\n");
            text.append(escHtml(t.getCustomerName() == null ? "Покупатель" : t.getCustomerName()));
            text.append(t.getProductTitle() != null && !t.getProductTitle().isBlank()
                    ? " · товар: <b>" + escHtml(ellipsize(t.getProductTitle(), 120)) + "</b>"
                    : " · общий вопрос");
            text.append('\n');
            if (preview != null && !preview.isBlank()) {
                text.append("<blockquote>").append(escHtml(ellipsize(preview, 300))).append("</blockquote>");
            }
            SendMessage msg = SendMessage.builder()
                    .chatId(chatId)
                    .text(text.toString())
                    .parseMode("HTML")
                    .replyMarkup(adminButton(t))
                    .build();
            int topic = props.getTelegram().getNotifyTopicChat();
            if (topic > 0) {
                msg.setMessageThreadId(topic);
            }
            activity.bot(ActivityLog.Entry.bot("ADMIN_SUPPORT_PING").toAdmins(chatId).customer(t.getTgUserId())
                    .text(newThread ? "Новый вопрос в поддержку" : "Новое сообщение в поддержке")
                    .detail("thread", UuidUtil.toString(t.getId())), () -> bot.execute(msg));
        } catch (Exception e) {
            log.warn("Support admin ping failed for thread {}: {}", UuidUtil.toString(t.getId()), e.getMessage());
        }
    }

    private InlineKeyboardMarkup adminButton(SupportThread t) {
        String adminBase = props.getAdminBaseUrl();
        if (!isHttps(adminBase)) {
            return null;
        }
        InlineKeyboardButton open = InlineKeyboardButton.builder()
                .text("🔎 Открыть в админке")
                .url(adminBase + "/support?thread=" + UuidUtil.toString(t.getId()))
                .build();
        return InlineKeyboardMarkup.builder().keyboard(List.of(List.of(open))).build();
    }

    /** Lock-screen text: no message body (it may hold a phone number), just who and about what. */
    void notifyAdminsPush(SupportThread t, boolean newThread) {
        String id = UuidUtil.toString(t.getId());
        String about = t.getProductTitle() != null && !t.getProductTitle().isBlank()
                ? "о товаре «" + ellipsize(nullToEmpty(t.getProductTitle()), 60) + "»"
                : "общий вопрос";
        String title = newThread ? "Вопрос в поддержку" : "Сообщение в поддержку";
        push.runAsync(() -> push.notifyAdmins(new PushMessage(
                title,
                "Покупатель пишет: " + about + " — откройте, чтобы ответить",
                "/support?thread=" + id, "support-" + id, badge(), true)));
    }

    private Integer badge() {
        try {
            return inbox.inbox().total();
        } catch (RuntimeException e) {
            return null;
        }
    }

    // ------------------------------------------------------------------ helpers

    private boolean botEnabled() {
        String token = props.getTelegram().getBotToken();
        return token != null && !token.isBlank();
    }

    private static boolean isHttps(String url) {
        return url != null && url.startsWith("https://");
    }
}
