package com.example.tgshop.tg;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;

@Component
public class TelegramSender {

    private final ShopBot bot;

    public TelegramSender(@Lazy ShopBot bot) {
        this.bot = bot;
    }

    public void safeExecute(SendMessage msg) {
        bot.safeExecute(msg);
    }
}
