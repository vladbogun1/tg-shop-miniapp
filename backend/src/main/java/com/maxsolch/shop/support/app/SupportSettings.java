package com.maxsolch.shop.support.app;

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
 * Support threads: on/off and the anti-spam limits.
 *
 * <p>The keys are the contract with the stored rows and the admin page: they never change. {@code @Order} fixes the
 * place of the group on the settings page.
 */
@Component
@Order(60)
public class SupportSettings implements SettingsContribution {

    // Support threads (SupportService). 0 = no limit / never.
    public static final String SUPPORT_ENABLED = "support.enabled";
    public static final String SUPPORT_COOLDOWN_SEC = "support.cooldownSec";
    public static final String SUPPORT_MAX_MESSAGES_PER_HOUR = "support.maxMessagesPerHour";
    public static final String SUPPORT_MAX_OPEN_THREADS = "support.maxOpenThreads";
    public static final String SUPPORT_MAX_LENGTH = "support.maxLength";
    public static final String SUPPORT_AUTO_CLOSE_DAYS = "support.autoCloseDays";

    @Override
    public List<SettingGroup> groups() {
        return List.of(
                new SettingGroup("support", "Поддержка",
                    "Вопросы покупателей о товарах и магазине (раздел «Поддержка»): лимиты против спама. "
                            + "0 — без ограничения."));
    }

    @Override
    public List<SettingDefinition> definitions() {
        return List.of(
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
                    7, 0, 365, "дн."));
    }
}
