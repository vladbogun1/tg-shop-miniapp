package com.maxsolch.shop.support.app;

import com.maxsolch.shop.support.domain.SupportThread;
import com.maxsolch.shop.support.infra.SupportThreadRepository;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.platform.i18n.ChatPreview;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.notification.app.AdminPushService;
import com.maxsolch.shop.notification.app.AdminPushService.PushMessage;
import com.maxsolch.shop.notification.app.CustomerBot;
import com.maxsolch.shop.notification.app.SellerChannel;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;


import static com.maxsolch.shop.platform.util.Texts.ellipsize;
import static com.maxsolch.shop.platform.util.Texts.escHtml;
import static com.maxsolch.shop.platform.util.Texts.nullToEmpty;

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

    private final CustomerBot customer;
    private final SellerChannel seller;
    private final Messages messages;
    private final AdminPushService push;
    private final AdminBadge adminBadge;
    private final SupportThreadRepository threads;

    public SupportNotifier(CustomerBot customer, SellerChannel seller, Messages messages, AdminPushService push,
                           AdminBadge adminBadge, SupportThreadRepository threads) {
        this.customer = customer;
        this.seller = seller;
        this.messages = messages;
        this.push = push;
        this.adminBadge = adminBadge;
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
        String id = UuidUtil.toString(t.getId());
        customer.sendTo("Support DM failed for thread " + id, t.getTgUserId(),
                ActivityLog.Entry.bot("SUPPORT_REPLY").toCustomer(t.getTgUserId()).detail("thread", id), locale -> {
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
            // The button opens the thread in the Mini App (deep link support_<id>).
            return new CustomerBot.Dm(text.toString(),
                    customer.miniAppButton(messages.get(locale, "bot.support.open"), "support_" + id));
        });
    }

    // ------------------------------------------------------------------ admins

    void notifyAdminsTelegram(SupportThread t, String preview, boolean newThread) {
        String id = UuidUtil.toString(t.getId());
        ActivityLog.Entry entry = ActivityLog.Entry.bot("ADMIN_SUPPORT_PING").customer(t.getTgUserId())
                .text(newThread ? "Новый вопрос в поддержку" : "Новое сообщение в поддержке")
                .detail("thread", id);
        seller.pingChatTopicUnlessZero("Support admin ping failed for thread " + id, entry, "/support?thread=" + id, () -> {
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
            return text.toString();
        });
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
            return adminBadge.total();
        } catch (RuntimeException e) {
            return null;
        }
    }
}
