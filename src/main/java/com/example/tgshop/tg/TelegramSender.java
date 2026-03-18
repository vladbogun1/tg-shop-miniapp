package com.example.tgshop.tg;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;
import org.telegram.telegrambots.meta.api.methods.forum.CreateForumTopic;
import org.telegram.telegrambots.meta.api.methods.forum.CloseForumTopic;
import org.telegram.telegrambots.meta.api.methods.forum.DeleteForumTopic;
import org.telegram.telegrambots.meta.api.methods.forum.EditForumTopic;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.methods.send.SendDocument;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.DeleteMessage;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.forum.ForumTopic;

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

    public Message safeExecuteMessage(SendMessage msg) {
        log.debug("🤖 TG Sending telegram message to chatId={}", msg.getChatId());
        return bot.safeExecuteMessage(msg);
    }

    public ForumTopic safeExecute(CreateForumTopic msg) {
        log.debug("🤖 TG Creating forum topic in chatId={}", msg.getChatId());
        return bot.safeExecute(msg);
    }

    public void safeExecute(EditForumTopic msg) {
        log.debug("🤖 TG Editing forum topic in chatId={}", msg.getChatId());
        bot.safeExecute(msg);
    }

    public Message safeExecute(SendDocument msg) {
        log.debug("🤖 TG Sending telegram document to chatId={}", msg.getChatId());
        return bot.safeExecute(msg);
    }

    public void safeExecute(DeleteMessage msg) {
        log.debug("🤖 TG Deleting telegram message in chatId={}", msg.getChatId());
        bot.safeExecute(msg);
    }

    public void safeExecute(CloseForumTopic msg) {
        log.debug("🤖 TG Closing forum topic in chatId={}", msg.getChatId());
        bot.safeExecute(msg);
    }

    public void safeExecute(DeleteForumTopic msg) {
        log.debug("🤖 TG Deleting forum topic in chatId={}", msg.getChatId());
        bot.safeExecute(msg);
    }

    public java.io.File downloadFile(String fileId) {
        return bot.safeDownloadFile(fileId);
    }
}
