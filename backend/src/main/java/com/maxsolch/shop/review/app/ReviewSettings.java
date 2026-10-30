package com.maxsolch.shop.review.app;

import com.maxsolch.shop.settings.app.SettingsContribution;
import com.maxsolch.shop.settings.domain.SettingDefinition;
import com.maxsolch.shop.settings.domain.SettingGroup;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

import static com.maxsolch.shop.settings.domain.SettingDefinition.boolSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.intSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.selectSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.textSetting;

/**
 * Product reviews and the review bonus.
 *
 * <p>The keys are the contract with the stored rows and the admin page: they never change. {@code @Order} fixes the
 * place of the group on the settings page.
 */
@Component
@Order(50)
public class ReviewSettings implements SettingsContribution {

    // Product reviews and the review bonus (V44, ReviewService / ReviewReminderJob).
    public static final String REVIEWS_ENABLED = "reviews.enabled";
    public static final String REVIEWS_PREMODERATION = "reviews.premoderation";
    public static final String REVIEWS_BONUS_PERCENT = "reviews.bonusPercent";
    /** Ceiling of the review bonus in ₴ (V63, promo_codes.max_discount_minor); 0 = no ceiling. */
    public static final String REVIEWS_BONUS_MAX_UAH = "reviews.bonusMaxDiscountUah";
    public static final String REVIEWS_BONUS_VALID_DAYS = "reviews.bonusValidDays";
    public static final String REVIEWS_MIN_LENGTH = "reviews.minLength";
    public static final String REVIEWS_REMINDER_DAYS = "reviews.reminderDays";
    public static final String REVIEWS_BONUS_EXPIRY_REMINDER_DAYS = "reviews.bonusExpiryReminderDays";
    public static final String REVIEWS_MAX_PER_DAY = "reviews.maxPerDay";

    @Override
    public List<SettingGroup> groups() {
        return List.of(
                new SettingGroup("reviews", "Отзывы",
                    "Отзывы покупателей о товарах из доставленных заказов и бонусный промокод за отзыв."));
    }

    @Override
    public List<SettingDefinition> definitions() {
        return List.of(
            boolSetting(REVIEWS_ENABLED, "reviews",
                    "Отзывы включены",
                    "Покупатели могут оставлять отзывы о товарах из доставленных заказов, а на карточке "
                            + "товара видны оценка и отзывы. Выключите — форма и напоминания пропадут.",
                    true),
            boolSetting(REVIEWS_PREMODERATION, "reviews",
                    "Премодерация",
                    "Отзыв появляется на сайте только после того, как его опубликует админ (раздел «Отзывы»). "
                            + "Выключите — отзыв публикуется сразу.",
                    true),
            intSetting(REVIEWS_BONUS_PERCENT, "reviews",
                    "Бонус за отзыв",
                    "Скидка личного одноразового промокода за первый опубликованный отзыв по заказу. "
                            + "0 — без бонуса.",
                    5, 0, 50, "%"),
            intSetting(REVIEWS_BONUS_MAX_UAH, "reviews",
                    "Бонус за отзыв — не больше",
                    "Потолок скидки по бонусному промокоду в гривнах: 5 % от заказа на 10 000 ₴ при потолке "
                            + "100 ₴ дадут −100 ₴, а не −500 ₴. Действует на новые коды; покупатель видит "
                            + "«−5 % (до 100 ₴)». 0 — без потолка.",
                    100, 0, 100000, "₴"),
            intSetting(REVIEWS_BONUS_VALID_DAYS, "reviews",
                    "Срок действия бонуса",
                    "Сколько дней действует бонусный промокод с момента выдачи.",
                    60, 1, 365, "дн."),
            intSetting(REVIEWS_BONUS_EXPIRY_REMINDER_DAYS, "reviews",
                    "Напомнить, что бонус сгорает, за",
                    "За сколько дней до конца срока бот напомнит о неиспользованном бонусном промокоде "
                            + "(один раз на код). 0 — не напоминать.",
                    3, 0, 30, "дн."),
            intSetting(REVIEWS_MIN_LENGTH, "reviews",
                    "Минимальная длина отзыва",
                    "Короче — покупатель увидит просьбу написать подробнее.",
                    10, 1, 1000, "симв."),
            intSetting(REVIEWS_REMINDER_DAYS, "reviews",
                    "Напомнить об отзыве через",
                    "Через сколько дней после доставки бот напомнит оставить отзыв (один раз на заказ). "
                            + "0 — не напоминать.",
                    2, 0, 60, "дн."),
            intSetting(REVIEWS_MAX_PER_DAY, "reviews",
                    "Отзывов в сутки от покупателя",
                    "Защита от спама: сколько отзывов один покупатель может оставить за 24 часа. "
                            + "0 — без ограничения.",
                    10, 0, 100, "шт"));
    }
}
