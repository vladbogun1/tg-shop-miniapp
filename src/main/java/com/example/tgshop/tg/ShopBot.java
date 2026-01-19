package com.example.tgshop.tg;

import com.example.tgshop.config.AppProperties;
import com.example.tgshop.tg.bot.TelegramBotGateway;
import com.example.tgshop.tg.handlers.AdminChatBridgeService;
import com.example.tgshop.tg.handlers.OrderDecisionHandler;
import com.example.tgshop.tg.handlers.ShopCommandHandler;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.bots.TelegramLongPollingBot;
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
import org.telegram.telegrambots.meta.api.objects.Update;

@Component
@Slf4j
public class ShopBot extends TelegramLongPollingBot implements TelegramBotGateway {

    private final AppProperties props;
    private final AdminChatBridgeService adminChatBridgeService;
    private final OrderDecisionHandler orderDecisionHandler;
    private final ShopCommandHandler shopCommandHandler;

    public ShopBot(
        AppProperties props,
        AdminChatBridgeService adminChatBridgeService,
        OrderDecisionHandler orderDecisionHandler,
        ShopCommandHandler shopCommandHandler
    ) {
        super(props.getTelegram().getBotToken());
        this.props = props;
        this.adminChatBridgeService = adminChatBridgeService;
        this.orderDecisionHandler = orderDecisionHandler;
        this.shopCommandHandler = shopCommandHandler;
    }

    @Override
    public String getBotUsername() {
        return props.getTelegram().getBotUsername();
    }

    @Override
    public void onUpdateReceived(Update update) {
        if (update == null) {
            return;
        }

        if (update.hasEditedMessage()) {
            adminChatBridgeService.handleEditedMessage(update.getEditedMessage(), this);
            return;
        }

        if (update.hasCallbackQuery()) {
            orderDecisionHandler.handleCallback(update, this);
            return;
        }

        if (!update.hasMessage()) {
            return;
        }

        Message message = update.getMessage();
        long chatId = message.getChatId();
        var from = message.getFrom();
        long userId = from != null ? from.getId() : 0;

        if (adminChatBridgeService.handleOrderChatMessage(message, userId, this)) {
            return;
        }
        if (adminChatBridgeService.handleUserReplyToAdmin(message, this)) {
            return;
        }

        if (!message.hasText()) {
            return;
        }

        if (orderDecisionHandler.handleRejectReply(update, userId, this)) {
            return;
        }
        if (orderDecisionHandler.handleTrackingReply(update, userId, this)) {
            return;
        }

        if (!shopCommandHandler.handle(message, userId, this)) {
            log.debug("🤖 TG No command matched for chatId={} userId={} text={}", chatId, userId, message.getText());
        }
    }

    @Override
    public void safeExecute(SendMessage msg) {
        try {
            execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to send message", e);
        }
    }

    @Override
    public void safeExecute(AnswerCallbackQuery msg) {
        try {
            execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to answer callback query", e);
        }
    }

    @Override
    public void safeExecute(EditMessageText msg) {
        try {
            execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to edit message text", e);
        }
    }

    @Override
    public void safeExecute(EditMessageCaption msg) {
        try {
            execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to edit message caption", e);
        }
    }

    @Override
    public void safeExecute(EditMessageReplyMarkup msg) {
        try {
            execute(msg);
        } catch (Exception e) {
            String errorMessage = e.getMessage();
            if (errorMessage != null && errorMessage.contains("message is not modified")) {
                log.debug("🤖 TG Skipping reply markup update: message not modified");
                return;
            }
            log.error("🤖 TG Failed to edit message reply markup", e);
        }
    }

    @Override
    public void safeExecute(DeleteMessage msg) {
        try {
            execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to delete message", e);
        }
    }

    @Override
    public Message safeExecuteMessage(SendMessage msg) {
        try {
            return execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to send message", e);
            return null;
        }
    }

    @Override
    public Message safeExecute(SendPhoto msg) {
        try {
            return execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to send photo", e);
            return null;
        }
    }

    @Override
    public Message safeExecute(SendDocument msg) {
        try {
            return execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to send document", e);
            return null;
        }
    }

    @Override
    public Message safeExecute(SendVideo msg) {
        try {
            return execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to send video", e);
            return null;
        }
    }

    @Override
    public Message safeExecute(SendAudio msg) {
        try {
            return execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to send audio", e);
            return null;
        }
    }

    @Override
    public Message safeExecute(SendVoice msg) {
        try {
            return execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to send voice", e);
            return null;
        }
    }

    @Override
    public Message safeExecute(SendAnimation msg) {
        try {
            return execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to send animation", e);
            return null;
        }
    }

    @Override
    public Message safeExecute(SendSticker msg) {
        try {
            return execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to send sticker", e);
            return null;
        }
    }

    @Override
    public Message safeExecute(SendVideoNote msg) {
        try {
            return execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to send video note", e);
            return null;
        }
    }

    @Override
    public Message safeExecute(SendContact msg) {
        try {
            return execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to send contact", e);
            return null;
        }
    }

    @Override
    public Message safeExecute(SendLocation msg) {
        try {
            return execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to send location", e);
            return null;
        }
    }

    public org.telegram.telegrambots.meta.api.objects.forum.ForumTopic safeExecute(
        org.telegram.telegrambots.meta.api.methods.forum.CreateForumTopic msg
    ) {
        try {
            return execute(msg);
        } catch (Exception e) {
            String errorMessage = e.getMessage();
            if (errorMessage != null && errorMessage.contains("chat is not a forum")) {
                log.warn("🤖 TG Admin chat is not a forum, skip topic creation");
                return null;
            }
            log.error("🤖 TG Failed to create forum topic", e);
            return null;
        }
    }
}
