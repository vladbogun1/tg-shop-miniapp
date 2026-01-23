package com.example.tgshop.tg;

import org.telegram.telegrambots.meta.api.methods.forum.EditForumTopic;
import org.telegram.telegrambots.meta.exceptions.TelegramApiValidationException;

public class SafeEditForumTopic extends EditForumTopic {

    @Override
    public void validate() throws TelegramApiValidationException {
        if (getChatId() == null || getChatId().isEmpty()) {
            throw new TelegramApiValidationException("ChatId can't be empty", this);
        }
        if (getMessageThreadId() == null) {
            throw new TelegramApiValidationException("MessageThreadId can't be empty", this);
        }
        if (getName() == null || getName().isEmpty()) {
            throw new TelegramApiValidationException("Name can't be empty", this);
        }
    }
}
