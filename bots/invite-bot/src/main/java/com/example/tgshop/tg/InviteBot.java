package com.example.tgshop.tg;

import com.example.tgshop.config.AppProperties;
import java.util.List;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.bots.TelegramLongPollingBot;
import org.telegram.telegrambots.meta.api.methods.send.SendPhoto;
import org.telegram.telegrambots.meta.api.objects.InputFile;
import org.telegram.telegrambots.meta.api.objects.Update;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;

@Component
public class InviteBot extends TelegramLongPollingBot {

    private static final String LANDING_CAPTION = "Добро пожаловать! Выбирай нужный раздел ниже 👇";

    private final AppProperties props;

    public InviteBot(AppProperties props) {
        super(props.getTelegram().getBotToken());
        this.props = props;
    }

    @Override
    public String getBotUsername() {
        return props.getTelegram().getBotUsername();
    }

    @Override
    public void onUpdateReceived(Update update) {
        if (update == null || !update.hasMessage() || !update.getMessage().hasText()) {
            return;
        }

        String text = update.getMessage().getText().trim();
        if (!text.startsWith("/start")) {
            return;
        }

        long chatId = update.getMessage().getChatId();
        sendLanding(chatId);
    }

    private void sendLanding(long chatId) {
        var keyboard = InlineKeyboardMarkup.builder()
            .keyboardRow(List.of(urlButton("🛍️ Магазин", "https://t.me/ChiSetup")))
            .keyboardRow(List.of(urlButton("⭐ Отзывы", "https://t.me/ChiSetup_Comments")))
            .keyboardRow(List.of(urlButton("📣 Основной канал", "https://t.me/maxsolch")))
            .build();

        var photo = SendPhoto.builder()
            .chatId(chatId)
            .photo(new InputFile(props.getInvite().getLandingImageUrl()))
            .caption(LANDING_CAPTION)
            .replyMarkup(keyboard)
            .build();

        safeExecute(photo);
    }

    private InlineKeyboardButton urlButton(String text, String url) {
        return InlineKeyboardButton.builder()
            .text(text)
            .url(url)
            .build();
    }

    private void safeExecute(SendPhoto msg) {
        try {
            execute(msg);
        } catch (Exception ignored) {
        }
    }
}
