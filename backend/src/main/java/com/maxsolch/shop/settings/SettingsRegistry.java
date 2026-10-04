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
    public static final String INBOX_NEW_STALE_HOURS = "inbox.newStaleHours";
    public static final String INBOX_APPROVED_STALE_HOURS = "inbox.approvedStaleHours";
    /** Prefix of the per-language /start greeting overrides: {@code bot.startText.uk} etc. */
    public static final String BOT_START_TEXT_PREFIX = "bot.startText.";

    /** Keys the backend writes about itself; never listed or editable in the admin. */
    public static final String SYSTEM_PREFIX = "system.";

    public static final List<Group> GROUPS = List.of(
            new Group("orders", "Корзина и промокоды", "Как ведут себя корзина и промокоды при оформлении."),
            new Group("stock", "Склад и метрики", "Пороги, по которым товары помечаются «мало» и «не продаются»."),
            new Group("notifications", "Уведомления", "Что бот пишет покупателям."),
            new Group("bot", "Бот", "Тексты, которые видит покупатель в Telegram-боте."),
            new Group("novaposhta", "Новая Почта", "Справочник отделений и почтоматов."),
            new Group("inbox", "Внимание", "Когда заказ попадает на экран «Внимание» как застрявший."));

    private static final List<SettingDefinition> DEFINITIONS = List.of(
            intSetting(PROMO_HOLD_MINUTES, "orders",
                    "Резерв промокода",
                    "Сколько промокод с ограниченным числом использований держится за покупателем, "
                            + "пока он оформляет заказ. Потом освобождается для других. "
                            + "На сайте в «Доставка и оплата» указано 30 минут — поправьте текст, если меняете.",
                    30, 5, 1440, "мин"),

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
                    24, 1, 720, "ч"));

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
