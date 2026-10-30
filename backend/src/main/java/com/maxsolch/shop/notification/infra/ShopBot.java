package com.maxsolch.shop.notification.infra;

import com.maxsolch.shop.notification.domain.BotUpdateHandler;
import com.maxsolch.shop.platform.config.AppProperties;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.bots.TelegramLongPollingBot;
import org.telegram.telegrambots.meta.api.objects.Update;

/**
 * Thin long-polling bot: it only RECEIVES and hands every update to {@link BotUpdateHandler}. Everything it says goes
 * out through the {@code TelegramGateway}. Registration happens in TelegramBotConfig, only when a token is configured.
 */
@Component
public class ShopBot extends TelegramLongPollingBot {

    private final AppProperties props;
    private final BotUpdateHandler handler;

    public ShopBot(AppProperties props, BotUpdateHandler handler) {
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
