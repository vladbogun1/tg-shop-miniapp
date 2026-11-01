package com.maxsolch.shop.notification.app;

import com.maxsolch.shop.platform.i18n.AppLocale;
import com.maxsolch.shop.settings.app.SettingsContribution;
import com.maxsolch.shop.settings.domain.SettingDefinition;
import com.maxsolch.shop.settings.domain.SettingGroup;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;

import static com.maxsolch.shop.settings.domain.SettingDefinition.boolSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.intSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.selectSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.textSetting;
import static com.maxsolch.shop.notification.domain.StartTextKeys.BOT_START_TEXT_PREFIX;

/**
 * Texts the customer sees in the Telegram bot.
 *
 * <p>The keys are the contract with the stored rows and the admin page: they never change. {@code @Order} fixes the
 * place of the group on the settings page.
 */
@Component
@Order(70)
public class BotSettings implements SettingsContribution {

    @Override
    public List<SettingGroup> groups() {
        return List.of(
                new SettingGroup("bot", "Бот", "Тексты, которые видит покупатель в Telegram-боте."));
    }

    @Override
    public List<SettingDefinition> definitions() {
        return Arrays.stream(AppLocale.values())
                .map(l -> textSetting(BOT_START_TEXT_PREFIX + l.code(), "bot",
                        "Приветствие /start — " + languageName(l),
                        "Пусто — стандартный текст. Обычный текст без разметки, до 2000 символов.",
                        "", 2000))
                .toList();
    }

    /** The language in the admin's words (the settings page is Russian); no default: a new language must be named. */
    private static String languageName(AppLocale l) {
        return switch (l) {
            case UK -> "украинский";
            case RU -> "русский";
            case EN -> "английский";
        };
    }
}
