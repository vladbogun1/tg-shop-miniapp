package com.maxsolch.shop.notification.app;

import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.api.objects.webapp.WebAppInfo;

import java.util.List;

/** The optional «open the shop» web_app button under a broadcast message. */
final class BroadcastButton {

    private BroadcastButton() {
    }

    /** Private chats only; needs an HTTPS webapp URL (else null: Telegram rejects the button, so skip it rather than fail the send). */
    static InlineKeyboardMarkup markup(String webappBaseUrl, boolean withButton, String buttonText, String lang) {
        if (!withButton || webappBaseUrl == null || !webappBaseUrl.startsWith("https://")) {
            return null;
        }
        // A typed label is used as is; the default one follows the recipient's language, like the text.
        String label = (buttonText == null || buttonText.isBlank())
                ? BroadcastRules.defaultButton(lang)
                : buttonText.trim();
        InlineKeyboardButton btn = InlineKeyboardButton.builder()
                .text(label)
                .webApp(WebAppInfo.builder().url(webappBaseUrl).build())
                .build();
        return InlineKeyboardMarkup.builder().keyboard(List.of(List.of(btn))).build();
    }
}
