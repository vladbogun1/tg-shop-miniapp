package com.maxsolch.shop.notification.infra;

import com.maxsolch.shop.notification.domain.BotUpdateHandler;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.bots.TelegramLongPollingBot;
import org.telegram.telegrambots.meta.api.objects.Update;

/**
 * Thin long-polling bot: it only RECEIVES and hands every update to {@link BotUpdateHandler}. Everything it says goes
 * out through the {@code TelegramGateway}. Registration happens in TelegramBotConfig, only when a token is configured.
 */
@Component
public class ShopBot extends TelegramLongPollingBot {

    private final NotificationProperties props;
    private final BotUpdateHandler handler;

    public ShopBot(NotificationProperties props, BotUpdateHandler handler) {
        super(props.getTelegram().getBotToken() == null ? "" : props.getTelegram().getBotToken());
        this.props = props;
        this.handler = handler;
    }

    @Override
    public String getBotUsername() {
        String u = props.getTelegram().getBotUsername();
        if (u == null) {
            return "shop_bot";
        }
        return u.startsWith("@") ? u.substring(1) : u;
    }

    @Override
    public void onUpdateReceived(Update update) {
        handler.onUpdate(update);
    }
}
