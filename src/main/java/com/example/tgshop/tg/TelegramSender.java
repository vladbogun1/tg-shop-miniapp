package com.example.tgshop.tg;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;

@Component
@Slf4j
public class TelegramSender {

    private final ShopBot bot;

    public TelegramSender(@Lazy ShopBot bot) {
        this.bot = bot;
    }

    public void safeExecute(SendMessage msg) {
        log.debug("🤖 TG Sending telegram message to chatId={}", msg.getChatId());
        bot.safeExecute(msg);
    }
}
