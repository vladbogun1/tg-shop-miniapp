package com.example.tgshop.tg.bot;

import org.telegram.telegrambots.meta.api.methods.AnswerCallbackQuery;
import org.telegram.telegrambots.meta.api.methods.send.SendAnimation;
import org.telegram.telegrambots.meta.api.methods.send.SendAudio;
import org.telegram.telegrambots.meta.api.methods.send.SendContact;
import org.telegram.telegrambots.meta.api.methods.send.SendDocument;
import org.telegram.telegrambots.meta.api.methods.send.SendLocation;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.methods.send.SendPhoto;
import org.telegram.telegrambots.meta.api.methods.send.SendSticker;
import org.telegram.telegrambots.meta.api.methods.send.SendVideo;
import org.telegram.telegrambots.meta.api.methods.send.SendVideoNote;
import org.telegram.telegrambots.meta.api.methods.send.SendVoice;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.DeleteMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageCaption;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageReplyMarkup;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageText;
import org.telegram.telegrambots.meta.api.objects.Message;

public interface TelegramBotGateway {
    void safeExecute(SendMessage msg);

    void safeExecute(AnswerCallbackQuery msg);

    void safeExecute(EditMessageText msg);

    void safeExecute(EditMessageCaption msg);

    void safeExecute(EditMessageReplyMarkup msg);

    void safeExecute(DeleteMessage msg);

    Message safeExecuteMessage(SendMessage msg);

    Message safeExecute(SendPhoto msg);

    Message safeExecute(SendDocument msg);

    Message safeExecute(SendVideo msg);

    Message safeExecute(SendAudio msg);

    Message safeExecute(SendVoice msg);

    Message safeExecute(SendAnimation msg);

    Message safeExecute(SendSticker msg);

    Message safeExecute(SendVideoNote msg);

    Message safeExecute(SendContact msg);

    Message safeExecute(SendLocation msg);
}
