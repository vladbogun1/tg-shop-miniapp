package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.infra.AiProperties;
import com.maxsolch.shop.settings.app.SettingsContribution;
import com.maxsolch.shop.settings.domain.SettingDefinition;
import com.maxsolch.shop.settings.domain.SettingGroup;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

import static com.maxsolch.shop.settings.domain.SettingDefinition.boolSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.intSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.selectSetting;

/**
 * «ИИ» in the settings: switches, limits, search, warnings. The group is finance-only: an admin without the
 * «Финансы» right does not see it and cannot save it (the server decides, in {@code SettingsService}). The keys are
 * the contract with the stored rows and the admin page: they never change. Keys, model and search URLs stay in
 * {@code .env}.
 *
 * <p>The month limit starts from {@code AI_MONTH_LIMIT_CENTS}; once the owner saves it, the database value wins.
 * Money settings are USD cents (the screen shows dollars and hryvnias).
 */
@Component
@Order(130)
public class AiSettings implements SettingsContribution {

    public static final String GROUP = "ai";
    public static final String ENABLED = "ai.enabled";
    public static final String FEATURE_CARD = "ai.feature.card";
    public static final String FEATURE_COMPLETION = "ai.feature.completion";
    public static final String FEATURE_TRANSLATION = "ai.feature.translation";
    public static final String FEATURE_SUPPLY = "ai.feature.supply";
    public static final String MONTH_LIMIT_CENTS = "ai.monthLimitCents";
    public static final String DAY_LIMIT_CENTS = "ai.dayLimitCents";
    public static final String BATCH_SIZE = "ai.batchSize";
    public static final String RATE_KOPECKS = "ai.usdRateKopecks";
    public static final String SERPER_PAID = "ai.serperPaid";
    public static final String ALERTS_TO = "ai.alertsTo";
    public static final String ALERTS_FINANCE = "FINANCE";
    public static final String ALERTS_MAIN = "MAIN";
    public static final String CEILING_FACTOR = "ai.jobCeilingFactor";
    public static final String DEADLINE_MINUTES = "ai.deadlineMinutes";
    public static final String RETENTION_DAYS = "ai.retentionDays";

    private final AiProperties props;

    public AiSettings(AiProperties props) {
        this.props = props;
    }

    @Override
    public List<SettingGroup> groups() {
        return List.of(new SettingGroup(GROUP, "ИИ",
                "Встроенный ИИ для карточек, переводов и поставок: выключатели, лимиты расхода, поиск и предупреждения. "
                        + "Только для владельца: ключи и модель задаются на сервере.", true));
    }

    @Override
    public List<SettingDefinition> definitions() {
        int monthCents = (int) Math.min(props.getMonthLimitCents(), 10_000_000L);
        return List.of(
            boolSetting(ENABLED, GROUP, "ИИ включён",
                    "Общий выключатель. Выключили — идущие задачи остановятся перед следующим шагом, новые не стартуют.",
                    true),
            boolSetting(FEATURE_CARD, GROUP, "Карточки товаров",
                    "Кнопка «Заполнить с ИИ» при создании карточки.", false),
            boolSetting(FEATURE_COMPLETION, GROUP, "Дозаполнение карточек",
                    "Дозаполнение характеристик у существующих товаров.", false),
            boolSetting(FEATURE_TRANSLATION, GROUP, "Переводы",
                    "Перевод названий и описаний на украинский и английский.", false),
            boolSetting(FEATURE_SUPPLY, GROUP, "Поставки",
                    "Чтение накладной со скриншотов и PDF.", false),
            intSetting(MONTH_LIMIT_CENTS, GROUP, "Лимит в месяц",
                    "Сколько можно потратить на ИИ за календарный месяц (модель и платный поиск вместе). "
                            + "0 — без лимита. Начальное значение берётся из переменной AI_MONTH_LIMIT_CENTS.",
                    monthCents, 0, 10_000_000, "цент $"),
            intSetting(DAY_LIMIT_CENTS, GROUP, "Лимит в день",
                    "Сколько можно потратить за день по времени магазина. 0 — без лимита.",
                    100, 0, 10_000_000, "цент $"),
            intSetting(BATCH_SIZE, GROUP, "Размер пачки",
                    "Сколько товаров ИИ берёт за один запуск пачкой (работает с этапа «Пачка»).", 30, 1, 100, "шт"),
            intSetting(RATE_KOPECKS, GROUP, "Курс доллара",
                    "Только для показа сумм в гривнах: копеек за один доллар (42,00 грн = 4200). "
                            + "Сумма задачи запоминается по курсу на момент её завершения.", 4200, 100, 100_000, "коп."),
            boolSetting(SERPER_PAID, GROUP, "Разрешить платный поиск",
                    "Serper даёт 2500 бесплатных запросов. Когда они кончатся, поиск идёт платно только при включённом "
                            + "выключателе. Свой SearXNG бесплатный и работает всегда.", false),
            selectSetting(ALERTS_TO, GROUP, "Кому слать предупреждения",
                    "Лимиты, отказ ключа и сбой поиска приходят push-уведомлением.", ALERTS_FINANCE,
                    List.of(new SettingDefinition.Option(ALERTS_FINANCE, "Всем с доступом к финансам"),
                            new SettingDefinition.Option(ALERTS_MAIN, "Только главным админам"))),
            intSetting(CEILING_FACTOR, GROUP, "Потолок расхода на задачу",
                    "Во сколько раз задача может потратить больше типичной (по её функции), прежде чем её остановят.",
                    3, 1, 20, "раз"),
            intSetting(DEADLINE_MINUTES, GROUP, "Дедлайн задачи",
                    "Сколько минут задача может работать, прежде чем её остановят со сбоем.", 5, 1, 30, "мин"),
            intSetting(RETENTION_DAYS, GROUP, "Срок хранения промптов и ответов",
                    "Через сколько дней текст промпта и ответа удаляется (цена и исход задачи остаются).",
                    60, 7, 365, "дн."));
    }
}
