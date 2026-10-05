package com.maxsolch.shop.settings;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static com.maxsolch.shop.settings.SettingDefinition.boolSetting;
import static com.maxsolch.shop.settings.SettingDefinition.intSetting;
import static com.maxsolch.shop.settings.SettingDefinition.textSetting;

/**
 * The closed list of settings the admin may change at runtime.
 *
 * <p>Only business parameters live here. Secrets and infrastructure (tokens, passwords, keys,
 * service URLs, ports, chat ids) stay in {@code .env} and are never exposed: a typo in one of
 * those breaks the shop, and a leaked admin session must not be able to read or redirect them.
 *
 * <p>Every default is exactly the value the code used before this registry existed, so a
 * deployment with an empty {@code shop_settings} table behaves as it always did.
 */
public final class SettingsRegistry {

    /** A section of the settings page. */
    public record Group(String id, String title, String description) {
    }

    // ---- keys (referenced by consumers; other packages read them via SettingsService) ----
    public static final String PROMO_HOLD_MINUTES = "promo.holdMinutes";
    public static final String CATALOG_LOW_STOCK_QTY = "catalog.lowStockQty";
    public static final String METRICS_LOW_STOCK_DAYS = "metrics.lowStockDays";
    public static final String METRICS_DEAD_STOCK_DAYS = "metrics.deadStockDays";
    public static final String NOTIFY_CUSTOMER_STATUS = "notify.customerStatus";
    public static final String NOVAPOSHTA_AUTO_SYNC = "novaposhta.autoSync";
    // Product reviews and the review bonus (V44, ReviewService / ReviewReminderJob).
    public static final String REVIEWS_ENABLED = "reviews.enabled";
    public static final String REVIEWS_PREMODERATION = "reviews.premoderation";
    public static final String REVIEWS_BONUS_PERCENT = "reviews.bonusPercent";
    public static final String REVIEWS_BONUS_VALID_DAYS = "reviews.bonusValidDays";
    public static final String REVIEWS_MIN_LENGTH = "reviews.minLength";
    public static final String REVIEWS_REMINDER_DAYS = "reviews.reminderDays";
    public static final String REVIEWS_MAX_PER_DAY = "reviews.maxPerDay";
    public static final String INBOX_NEW_STALE_HOURS = "inbox.newStaleHours";
    public static final String INBOX_APPROVED_STALE_HOURS = "inbox.approvedStaleHours";
    // Anti-bot / anti-hoarding limits on placing orders (OrderGuard). 0 = no limit.
    public static final String ANTIBOT_MAX_UNPAID_ORDERS = "antibot.maxUnpaidOrders";
    public static final String ANTIBOT_ORDER_COOLDOWN_SEC = "antibot.orderCooldownSec";
    public static final String ANTIBOT_MAX_ORDERS_PER_DAY = "antibot.maxOrdersPerDay";
    public static final String ANTIBOT_MAX_QTY_PER_PRODUCT = "antibot.maxQtyPerProduct";
    public static final String ANTIBOT_MAX_UNITS_PER_ORDER = "antibot.maxUnitsPerOrder";
    public static final String ANTIBOT_MAX_SELF_CANCELS_PER_DAY = "antibot.maxSelfCancelsPerDay";
    // Support threads (SupportService). 0 = no limit / never.
    public static final String SUPPORT_ENABLED = "support.enabled";
    public static final String SUPPORT_COOLDOWN_SEC = "support.cooldownSec";
    public static final String SUPPORT_MAX_MESSAGES_PER_HOUR = "support.maxMessagesPerHour";
    public static final String SUPPORT_MAX_OPEN_THREADS = "support.maxOpenThreads";
    public static final String SUPPORT_MAX_LENGTH = "support.maxLength";
    public static final String SUPPORT_AUTO_CLOSE_DAYS = "support.autoCloseDays";
    /** Prefix of the per-language /start greeting overrides: {@code bot.startText.uk} etc. */
    public static final String BOT_START_TEXT_PREFIX = "bot.startText.";

    /** Keys the backend writes about itself; never listed or editable in the admin. */
    public static final String SYSTEM_PREFIX = "system.";

    public static final List<Group> GROUPS = List.of(
            new Group("orders", "Корзина и промокоды", "Как ведут себя корзина и промокоды при оформлении."),
            new Group("stock", "Склад и метрики", "Пороги, по которым товары помечаются «мало» и «не продаются»."),
            new Group("notifications", "Уведомления", "Что бот пишет покупателям."),
            new Group("reviews", "Отзывы",
                    "Отзывы покупателей о товарах из доставленных заказов и бонусный промокод за отзыв."),
            new Group("support", "Поддержка",
                    "Вопросы покупателей о товарах и магазине (раздел «Поддержка»): лимиты против спама. "
                            + "0 — без ограничения."),
            new Group("bot", "Бот", "Тексты, которые видит покупатель в Telegram-боте."),
            new Group("novaposhta", "Новая Почта", "Справочник отделений и почтоматов."),
            new Group("inbox", "Внимание", "Когда заказ попадает на экран «Внимание» как застрявший."),
            new Group("antibot", "Защита от ботов и спама",
                    "Лимиты на оформление заказов: против ботов и скупки товара. 0 — без ограничения."));

    private static final List<SettingDefinition> DEFINITIONS = List.of(
            boolSetting(SUPPORT_ENABLED, "support",
                    "Поддержка включена",
                    "Кнопки «Задать вопрос о товаре» и «Поддержка» на сайте и в Mini App. Выключено — "
                            + "новые вопросы не принимаются, а на открытые обращения можно ответить из админки.",
                    true),
            intSetting(SUPPORT_COOLDOWN_SEC, "support",
                    "Пауза между сообщениями",
                    "Минимальный промежуток между двумя сообщениями покупателя в поддержку. 0 — без паузы.",
                    10, 0, 3600, "сек"),
            intSetting(SUPPORT_MAX_MESSAGES_PER_HOUR, "support",
                    "Сообщений в час",
                    "Сколько сообщений покупатель может написать в поддержку за час (во все обращения). "
                            + "0 — без ограничения.",
                    30, 0, 1000, "шт"),
            intSetting(SUPPORT_MAX_OPEN_THREADS, "support",
                    "Открытых обращений одновременно",
                    "Сколько незакрытых обращений может быть у покупателя. Вопрос о товаре, по которому "
                            + "уже есть открытое обращение, попадает в него. 0 — без ограничения.",
                    3, 0, 50, "шт"),
            intSetting(SUPPORT_MAX_LENGTH, "support",
                    "Длина сообщения",
                    "Максимум символов в одном сообщении покупателя.",
                    2000, 100, 8000, "симв."),
            intSetting(SUPPORT_AUTO_CLOSE_DAYS, "support",
                    "Закрывать без активности через",
                    "Обращение без новых сообщений дольше этого срока закрывается само (проверка раз в час). "
                            + "Вопрос без ответа магазина не закрывается. 0 — не закрывать.",
                    7, 0, 365, "дн."),

            intSetting(PROMO_HOLD_MINUTES, "orders",
                    "Резерв промокода",
                    "Сколько промокод с ограниченным числом использований держится за покупателем, "
                            + "пока он оформляет заказ. Потом освобождается для других. "
                            + "На сайте в «Доставка и оплата» указано 30 минут — поправьте текст, если меняете.",
                    30, 5, 1440, "мин"),

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
            intSetting(REVIEWS_BONUS_VALID_DAYS, "reviews",
                    "Срок действия бонуса",
                    "Сколько дней действует бонусный промокод с момента выдачи.",
                    60, 1, 365, "дн."),
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
                    10, 0, 100, "шт"),

            intSetting(CATALOG_LOW_STOCK_QTY, "stock",
                    "Порог «мало на складе»",
                    "Товар с остатком не больше этого числа (но больше нуля) помечается «Мало».",
                    3, 0, 1000, "шт"),
            intSetting(METRICS_LOW_STOCK_DAYS, "stock",
                    "«Скоро закончится», если запаса меньше чем на",
                    "В метриках товар попадает в «скоро закончится», если при нынешнем темпе продаж "
                            + "остатка хватит меньше чем на столько дней.",
                    14, 1, 365, "дн."),
            intSetting(METRICS_DEAD_STOCK_DAYS, "stock",
                    "«Мёртвый сток» — без продаж дольше",
                    "Товар в наличии, который не продавался дольше этого срока, считается мёртвым стоком.",
                    60, 7, 730, "дн."),

            boolSetting(NOTIFY_CUSTOMER_STATUS, "notifications",
                    "Сообщать покупателю о смене статуса",
                    "Бот пишет покупателю в Telegram, когда заказ принят, отправлен, доставлен или отменён. "
                            + "Можно выключить на время массовой правки статусов.",
                    true),

            textSetting(BOT_START_TEXT_PREFIX + "uk", "bot",
                    "Приветствие /start — украинский",
                    "Пусто — стандартный текст. Обычный текст без разметки, до 2000 символов.",
                    "", 2000),
            textSetting(BOT_START_TEXT_PREFIX + "ru", "bot",
                    "Приветствие /start — русский",
                    "Пусто — стандартный текст. Обычный текст без разметки, до 2000 символов.",
                    "", 2000),
            textSetting(BOT_START_TEXT_PREFIX + "en", "bot",
                    "Приветствие /start — английский",
                    "Пусто — стандартный текст. Обычный текст без разметки, до 2000 символов.",
                    "", 2000),

            boolSetting(NOVAPOSHTA_AUTO_SYNC, "novaposhta",
                    "Обновлять отделения каждую ночь",
                    "Каждую ночь бэкенд подтягивает свежий список отделений и почтоматов. "
                            + "Выключайте, только если API Новой Почты сбоит.",
                    true),

            intSetting(INBOX_NEW_STALE_HOURS, "inbox",
                    "Новый заказ без одобрения дольше",
                    "Новый заказ, который не одобрили за это время, появляется на экране «Внимание».",
                    3, 1, 168, "ч"),
            intSetting(INBOX_APPROVED_STALE_HOURS, "inbox",
                    "Одобрен, но не отправлен дольше",
                    "Одобренный заказ, который не отправили за это время (считая от одобрения), "
                            + "появляется на экране «Внимание».",
                    24, 1, 720, "ч"),

            intSetting(ANTIBOT_MAX_UNPAID_ORDERS, "antibot",
                    "Неоплаченных заказов одновременно",
                    "Сколько неоплаченных (новых или одобренных) заказов может висеть у одного покупателя. "
                            + "Следующий заказ — только после оплаты или отмены. 0 — без ограничения.",
                    2, 0, 50, "шт"),
            intSetting(ANTIBOT_ORDER_COOLDOWN_SEC, "antibot",
                    "Пауза между заказами",
                    "Минимальный промежуток между двумя заказами одного покупателя. 0 — без паузы.",
                    60, 0, 3600, "сек"),
            intSetting(ANTIBOT_MAX_ORDERS_PER_DAY, "antibot",
                    "Заказов за сутки",
                    "Сколько заказов покупатель может оформить за последние 24 часа. 0 — без ограничения.",
                    5, 0, 100, "шт"),
            intSetting(ANTIBOT_MAX_QTY_PER_PRODUCT, "antibot",
                    "Штук одного товара в заказе",
                    "Максимум одинаковых товаров (одного варианта) в одном заказе — против скупки. "
                            + "Корзина не даст положить больше. 0 — без ограничения.",
                    5, 0, 1000, "шт"),
            intSetting(ANTIBOT_MAX_UNITS_PER_ORDER, "antibot",
                    "Всего штук в заказе",
                    "Сколько единиц товара всего может быть в одном заказе. 0 — без ограничения.",
                    20, 0, 10000, "шт"),
            intSetting(ANTIBOT_MAX_SELF_CANCELS_PER_DAY, "antibot",
                    "Своих отмен за сутки",
                    "Если покупатель сам отменил столько заказов за 24 часа, новые заказы ему недоступны "
                            + "до конца этого окна. 0 — без ограничения.",
                    3, 0, 100, "шт"));

    private static final Map<String, SettingDefinition> BY_KEY = new LinkedHashMap<>();

    static {
        for (SettingDefinition d : DEFINITIONS) {
            if (BY_KEY.put(d.key(), d) != null) {
                throw new IllegalStateException("Duplicate setting key " + d.key());
            }
            if (GROUPS.stream().noneMatch(g -> g.id().equals(d.group()))) {
                throw new IllegalStateException("Unknown group " + d.group() + " of " + d.key());
            }
        }
    }

    private SettingsRegistry() {
    }

    public static List<SettingDefinition> all() {
        return DEFINITIONS;
    }

    public static Optional<SettingDefinition> find(String key) {
        return Optional.ofNullable(key == null ? null : BY_KEY.get(key));
    }
}
