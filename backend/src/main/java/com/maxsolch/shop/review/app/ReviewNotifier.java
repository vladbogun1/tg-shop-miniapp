package com.maxsolch.shop.review.app;

import com.maxsolch.shop.review.domain.ReviewRules;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.push.AdminPushService;
import com.maxsolch.shop.tg.CustomerBot;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.platform.tx.OnCommitted;
import com.maxsolch.shop.review.domain.ReviewEvents;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

import static com.maxsolch.shop.platform.util.Texts.ellipsize;
import static com.maxsolch.shop.platform.util.Texts.escHtml;
import static com.maxsolch.shop.platform.util.Texts.nullToEmpty;

/**
 * Best-effort Telegram DMs of the reviews feature (bonus code, "leave a review" reminder) and the
 * admins' push about a review waiting for moderation. Never throws — a bot hiccup must not undo a
 * publish. Called after the transaction commits.
 */
@Slf4j
@Service
public class ReviewNotifier {

    private static final ZoneId KYIV = ShopZone.DEFAULT;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    private final CustomerBot customer;
    private final Messages messages;
    private final AdminPushService push;

    public ReviewNotifier(CustomerBot customer, Messages messages, AdminPushService push) {
        this.customer = customer;
        this.messages = messages;
        this.push = push;
    }

    /** Is there a bot to write with at all? */
    public boolean enabled() {
        return customer.enabled();
    }

    /** "5%" or, with a ceiling, "5% (до 100 ₴)" in the customer's language. */
    private String discount(Locale locale, int percent, long maxMinor) {
        return maxMinor > 0
                ? messages.get(locale, "bot.review.bonus.discountCapped", String.valueOf(percent), ReviewRules.uah(maxMinor))
                : messages.get(locale, "bot.review.bonus.discount", String.valueOf(percent));
    }

    @OnCommitted
    public void on(ReviewEvents.BonusIssued e) {
        bonusIssued(e.tgUserId(), e.code(), e.percent(), e.maxMinor(), e.expiresAt());
    }

    @OnCommitted
    public void on(ReviewEvents.PendingForModeration e) {
        pendingForModeration(e.productTitle(), e.rating(), e.pendingCount());
    }

    /** "Thanks for the review — here is your personal code". */
    public void bonusIssued(Long tgUserId, String code, int percent, long maxMinor, Instant expiresAt) {
        customer.sendTo("Review bonus DM failed for " + tgUserId, tgUserId,
                ActivityLog.Entry.bot("REVIEW_BONUS").toCustomer(tgUserId)
                        .detail("percent", percent).detail("maxDiscountMinor", maxMinor), locale -> {
            String text = messages.get(locale, "bot.review.bonus.title") + "\n"
                    + messages.get(locale, "bot.review.bonus.body", "<code>" + escHtml(code) + "</code>",
                            discount(locale, percent, maxMinor), DATE.format(expiresAt.atZone(KYIV)));
            // The code itself is the customer's personal discount — the journal keeps only its size.
            String journal = "Бонус за отзыв: персональный промокод −" + ReviewRules.discountRu(percent, maxMinor)
                    + " до " + DATE.format(expiresAt.atZone(KYIV));
            return new CustomerBot.Dm(text, customer.miniAppButton(messages.get(locale, "bot.review.bonus.open"), null),
                    journal);
        });
    }

    /**
     * "How was your order? Leave a review and get −N%". The button opens the order page in the
     * Mini App ({@code startapp=view_<id>}), where the review form is.
     *
     * @param bonusPercent 0 = no bonus, the text then does not promise one
     * @param bonusMaxMinor the bonus ceiling (kopecks), 0 = none
     * @return whether the message went out
     */
    public boolean reminder(Long tgUserId, byte[] orderId, int bonusPercent, long bonusMaxMinor) {
        return customer.sendTo("Review reminder DM failed for " + tgUserId, tgUserId,
                ActivityLog.Entry.bot("REVIEW_REMINDER").toCustomer(tgUserId).order(orderId)
                        .detail("bonusPercent", bonusPercent), locale -> {
            String id = UuidUtil.toString(orderId);
            String text = messages.get(locale, "bot.review.reminder.title", id.substring(0, 8)) + "\n"
                    + (bonusPercent > 0
                    ? messages.get(locale, "bot.review.reminder.bodyBonus", discount(locale, bonusPercent, bonusMaxMinor))
                    : messages.get(locale, "bot.review.reminder.body"));
            return new CustomerBot.Dm(text,
                    customer.miniAppButton(messages.get(locale, "bot.review.reminder.button"), "view_" + id));
        });
    }

    /**
     * "Your −N% bonus runs out on …". The button opens the shop; at checkout the code is offered
     * above the promo field, so the customer does not have to copy it.
     *
     * @return whether the message went out
     */
    public boolean bonusExpiring(Long tgUserId, String code, int percent, long maxMinor, Instant expiresAt) {
        return customer.sendTo("Bonus expiry DM failed for " + tgUserId, tgUserId,
                ActivityLog.Entry.bot("REVIEW_BONUS_EXPIRING").toCustomer(tgUserId).detail("percent", percent), locale -> {
            String date = DATE.format(expiresAt.atZone(KYIV));
            String text = messages.get(locale, "bot.review.bonusExpiring.title", discount(locale, percent, maxMinor)) + "\n"
                    + messages.get(locale, "bot.review.bonusExpiring.body", "<code>" + escHtml(code) + "</code>", date);
            // As with the bonus itself, the journal keeps the size and the date, not the code.
            String journal = "Бонус −" + ReviewRules.discountRu(percent, maxMinor) + " сгорает " + date;
            return new CustomerBot.Dm(text, customer.miniAppButton(messages.get(locale, "bot.review.bonus.open"), null),
                    journal);
        });
    }

    /** Push to the admins' devices: a review waits for moderation. */
    public void pendingForModeration(String productTitle, int rating, long pendingCount) {
        try {
            push.notifyAdmins(new AdminPushService.PushMessage(
                    "Новый отзыв на модерации",
                    "★".repeat(Math.max(1, Math.min(5, rating))) + " " + ellipsize(nullToEmpty(productTitle), 80),
                    "/reviews", "reviews", (int) Math.min(Integer.MAX_VALUE, pendingCount), false));
        } catch (RuntimeException e) {
            log.warn("Review push failed: {}", e.toString());
        }
    }
}
