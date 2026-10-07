package com.maxsolch.shop.review;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.journal.ActivityLog;
import com.maxsolch.shop.push.AdminPushService;
import com.maxsolch.shop.tg.ShopBot;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.api.objects.webapp.WebAppInfo;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

/**
 * Best-effort Telegram DMs of the reviews feature (bonus code, "leave a review" reminder) and the
 * admins' push about a review waiting for moderation. Never throws — a bot hiccup must not undo a
 * publish. Called after the transaction commits.
 */
@Slf4j
@Service
public class ReviewNotifier {

    private static final ZoneId KYIV = ZoneId.of("Europe/Kyiv");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    private final ShopBot bot;
    private final AppProperties props;
    private final Messages messages;
    private final AdminPushService push;
    private final ActivityLog activity;

    public ReviewNotifier(@Lazy ShopBot bot, AppProperties props, Messages messages, AdminPushService push,
                          ActivityLog activity) {
        this.bot = bot;
        this.props = props;
        this.messages = messages;
        this.push = push;
        this.activity = activity;
    }

    /** Is there a bot to write with at all? */
    public boolean enabled() {
        String token = props.getTelegram().getBotToken();
        return token != null && !token.isBlank();
    }

    /** "Thanks for the review — here is your personal code". */
    public void bonusIssued(Long tgUserId, String code, int percent, Instant expiresAt) {
        if (!enabled() || tgUserId == null || tgUserId <= 0) {
            return;
        }
        try {
            Locale locale = messages.localeOf(tgUserId);
            String text = messages.get(locale, "bot.review.bonus.title") + "\n"
                    + messages.get(locale, "bot.review.bonus.body", "<code>" + esc(code) + "</code>",
                            String.valueOf(percent), DATE.format(expiresAt.atZone(KYIV)));
            SendMessage msg = SendMessage.builder()
                    .chatId(String.valueOf(tgUserId))
                    .text(text)
                    .parseMode("HTML")
                    .replyMarkup(button(messages.get(locale, "bot.review.bonus.open"), null))
                    .build();
            // The code itself is the customer's personal discount — the journal keeps only its size.
            activity.bot(ActivityLog.Entry.bot("REVIEW_BONUS").toCustomer(tgUserId)
                    .text("Бонус за отзыв: персональный промокод −" + percent + "% до "
                            + DATE.format(expiresAt.atZone(KYIV)))
                    .detail("percent", percent), () -> bot.execute(msg));
        } catch (Exception e) {
            log.warn("Review bonus DM failed for {}: {}", tgUserId, e.getMessage());
        }
    }

    /**
     * "How was your order? Leave a review and get −N%". The button opens the order page in the
     * Mini App ({@code startapp=view_<id>}), where the review form is.
     *
     * @param bonusPercent 0 = no bonus, the text then does not promise one
     * @return whether the message went out
     */
    public boolean reminder(Long tgUserId, byte[] orderId, int bonusPercent) {
        if (!enabled() || tgUserId == null || tgUserId <= 0) {
            return false;
        }
        try {
            Locale locale = messages.localeOf(tgUserId);
            String id = UuidUtil.toString(orderId);
            String text = messages.get(locale, "bot.review.reminder.title", id.substring(0, 8)) + "\n"
                    + (bonusPercent > 0
                    ? messages.get(locale, "bot.review.reminder.bodyBonus", String.valueOf(bonusPercent))
                    : messages.get(locale, "bot.review.reminder.body"));
            SendMessage msg = SendMessage.builder()
                    .chatId(String.valueOf(tgUserId))
                    .text(text)
                    .parseMode("HTML")
                    .replyMarkup(button(messages.get(locale, "bot.review.reminder.button"), "view_" + id))
                    .build();
            activity.bot(ActivityLog.Entry.bot("REVIEW_REMINDER").toCustomer(tgUserId).order(orderId)
                    .text(text).detail("bonusPercent", bonusPercent), () -> bot.execute(msg));
            return true;
        } catch (Exception e) {
            log.warn("Review reminder DM failed for {}: {}", tgUserId, e.getMessage());
            return false;
        }
    }

    /** Push to the admins' devices: a review waits for moderation. */
    public void pendingForModeration(String productTitle, int rating, long pendingCount) {
        try {
            push.notifyAdmins(new AdminPushService.PushMessage(
                    "Новый отзыв на модерации",
                    "★".repeat(Math.max(1, Math.min(5, rating))) + " " + trim(productTitle, 80),
                    "/reviews", "reviews", (int) Math.min(Integer.MAX_VALUE, pendingCount), false));
        } catch (RuntimeException e) {
            log.warn("Review push failed: {}", e.toString());
        }
    }

    private InlineKeyboardMarkup button(String label, String startapp) {
        String webapp = props.getWebappBaseUrl();
        if (webapp == null || !webapp.startsWith("https://")) {
            return null;
        }
        String url = startapp == null ? webapp : webapp + "?startapp=" + startapp;
        InlineKeyboardButton btn = InlineKeyboardButton.builder()
                .text(label)
                .webApp(WebAppInfo.builder().url(url).build())
                .build();
        return InlineKeyboardMarkup.builder().keyboard(List.of(List.of(btn))).build();
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private static String trim(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }
}
