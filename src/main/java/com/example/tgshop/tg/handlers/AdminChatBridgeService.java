package com.example.tgshop.tg.handlers;

import com.example.tgshop.config.AppProperties;
import com.example.tgshop.order.OrderEntity;
import com.example.tgshop.order.OrderService;
import com.example.tgshop.tg.bot.BotMessageUtils;
import com.example.tgshop.tg.bot.BotState;
import com.example.tgshop.tg.bot.BotState.ChatKey;
import com.example.tgshop.tg.bot.TelegramBotGateway;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.meta.api.methods.ParseMode;
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
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageCaption;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageText;
import org.telegram.telegrambots.meta.api.objects.InputFile;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.PhotoSize;
import org.telegram.telegrambots.meta.api.objects.User;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.ForceReplyKeyboard;

@Component
@Slf4j
public class AdminChatBridgeService {
    private final AppProperties props;
    private final OrderService orderService;
    private final BotState state;

    public AdminChatBridgeService(
        AppProperties props,
        OrderService orderService,
        BotState state
    ) {
        this.props = props;
        this.orderService = orderService;
        this.state = state;
    }

    public boolean handleEditedMessage(Message message, TelegramBotGateway gateway) {
        if (message == null) {
            return false;
        }

        User from = message.getFrom();
        if (from == null || Boolean.TRUE.equals(from.getIsBot())) {
            return false;
        }

        ChatKey sourceKey = new ChatKey(message.getChatId(), message.getMessageId());
        if (message.getMessageThreadId() != null && isAdmin(from.getId())) {
            Optional<OrderEntity> orderOpt = orderService.findByAdminThread(message.getChatId(), message.getMessageThreadId());
            if (orderOpt.isPresent()) {
                updateAdminMirrorMessage(orderOpt.get(), message, sourceKey, gateway);
                return true;
            }
        }

        if (state.userToAdminMap().containsKey(sourceKey)) {
            updateUserMirrorMessage(message, sourceKey, gateway);
            return true;
        }
        return false;
    }

    public boolean handleOrderChatMessage(Message message, long userId, TelegramBotGateway gateway) {
        if (message == null || message.getMessageThreadId() == null) {
            return false;
        }
        if (!isAdmin(userId)) {
            return false;
        }
        if (message.getFrom() == null || Boolean.TRUE.equals(message.getFrom().getIsBot())) {
            return false;
        }

        Optional<OrderEntity> orderOpt = orderService.findByAdminThread(message.getChatId(), message.getMessageThreadId());
        if (orderOpt.isEmpty()) {
            return false;
        }
        OrderEntity order = orderOpt.get();
        if (order.getTgUserId() <= 0) {
            return false;
        }

        ChatKey sourceKey = new ChatKey(message.getChatId(), message.getMessageId());
        Message headerMessage = sendAdminHeaderToUser(order, message, gateway);
        if (headerMessage == null) {
            return true;
        }

        ChatKey headerKey = new ChatKey(headerMessage.getChatId(), headerMessage.getMessageId());
        state.adminToUserHeaderMap().put(sourceKey, headerKey);
        state.replyAnchorMap().put(headerKey, order.uuid());

        if (BotMessageUtils.isMediaMessage(message)) {
            Message sent = sendMessageToUser(order.getTgUserId(), message, headerMessage.getMessageId(), gateway);
            if (sent != null) {
                ChatKey targetKey = new ChatKey(order.getTgUserId(), sent.getMessageId());
                state.adminToUserMap().put(sourceKey, targetKey);
            }
        } else {
            state.adminToUserMap().put(sourceKey, headerKey);
        }

        return true;
    }

    public boolean handleUserReplyToAdmin(Message message, TelegramBotGateway gateway) {
        if (message == null || message.getReplyToMessage() == null) {
            return false;
        }
        if (message.getFrom() == null || Boolean.TRUE.equals(message.getFrom().getIsBot())) {
            return false;
        }

        ChatKey replyKey = new ChatKey(message.getChatId(), message.getReplyToMessage().getMessageId());
        UUID orderId = state.replyAnchorMap().get(replyKey);
        if (orderId == null) {
            return false;
        }

        Optional<OrderEntity> orderOpt = orderService.findByUuid(orderId);
        if (orderOpt.isEmpty()) {
            return false;
        }
        OrderEntity order = orderOpt.get();
        if (order.getAdminChatId() == null || order.getAdminThreadId() == null) {
            return false;
        }

        Message sent = sendUserMessageToAdmin(order, message, gateway);
        if (sent != null) {
            ChatKey sourceKey = new ChatKey(message.getChatId(), message.getMessageId());
            ChatKey targetKey = new ChatKey(order.getAdminChatId(), sent.getMessageId());
            state.userToAdminMap().put(sourceKey, targetKey);
            state.userMessageOrderMap().put(sourceKey, order.uuid());
        }
        return true;
    }

    private Message sendAdminHeaderToUser(OrderEntity order, Message adminMessage, TelegramBotGateway gateway) {
        ForceReplyKeyboard forceReply = ForceReplyKeyboard.builder()
            .forceReply(true)
            .selective(true)
            .build();

        String headerText = buildAdminHeaderText(order, adminMessage);
        SendMessage header = SendMessage.builder()
            .chatId(String.valueOf(order.getTgUserId()))
            .parseMode(ParseMode.HTML)
            .text(headerText)
            .replyMarkup(forceReply)
            .build();
        return gateway.safeExecuteMessage(header);
    }

    private Message sendMessageToUser(long userId, Message sourceMessage, Integer replyToMessageId, TelegramBotGateway gateway) {
        return sendMessageToChat(userId, null, replyToMessageId, sourceMessage, gateway);
    }

    private Message sendMessageToAdmin(OrderEntity order, Message sourceMessage, TelegramBotGateway gateway) {
        return sendMessageToChat(order.getAdminChatId(), order.getAdminThreadId(), null, sourceMessage, gateway);
    }

    private Message sendUserMessageToAdmin(OrderEntity order, Message sourceMessage, TelegramBotGateway gateway) {
        String headerText = buildUserHeaderText(order);
        if (sourceMessage.hasText()) {
            String body = BotMessageUtils.escapeHtml(sourceMessage.getText());
            SendMessage msg = SendMessage.builder()
                .chatId(String.valueOf(order.getAdminChatId()))
                .messageThreadId(order.getAdminThreadId())
                .parseMode(ParseMode.HTML)
                .text(headerText + "\n" + body)
                .build();
            return gateway.safeExecuteMessage(msg);
        }

        SendMessage header = SendMessage.builder()
            .chatId(String.valueOf(order.getAdminChatId()))
            .messageThreadId(order.getAdminThreadId())
            .parseMode(ParseMode.HTML)
            .text(headerText)
            .build();
        Message headerMessage = gateway.safeExecuteMessage(header);
        Integer replyToMessageId = headerMessage != null ? headerMessage.getMessageId() : null;
        Message sent = sendMessageToChat(
            order.getAdminChatId(),
            order.getAdminThreadId(),
            replyToMessageId,
            sourceMessage,
            gateway
        );
        return sent != null ? sent : headerMessage;
    }

    private Message sendMessageToChat(
        long chatId,
        Integer threadId,
        Integer replyToMessageId,
        Message sourceMessage,
        TelegramBotGateway gateway
    ) {
        String chatIdStr = String.valueOf(chatId);
        if (sourceMessage.hasText()) {
            SendMessage msg = SendMessage.builder()
                .chatId(chatIdStr)
                .messageThreadId(threadId)
                .replyToMessageId(replyToMessageId)
                .text(sourceMessage.getText())
                .build();
            return gateway.safeExecuteMessage(msg);
        }
        if (sourceMessage.hasPhoto()) {
            PhotoSize photo = sourceMessage.getPhoto().get(sourceMessage.getPhoto().size() - 1);
            SendPhoto msg = SendPhoto.builder()
                .chatId(chatIdStr)
                .messageThreadId(threadId)
                .replyToMessageId(replyToMessageId)
                .photo(new InputFile(photo.getFileId()))
                .caption(sourceMessage.getCaption())
                .build();
            return gateway.safeExecute(msg);
        }
        if (sourceMessage.hasDocument()) {
            SendDocument msg = SendDocument.builder()
                .chatId(chatIdStr)
                .messageThreadId(threadId)
                .replyToMessageId(replyToMessageId)
                .document(new InputFile(sourceMessage.getDocument().getFileId()))
                .caption(sourceMessage.getCaption())
                .build();
            return gateway.safeExecute(msg);
        }
        if (sourceMessage.hasVideo()) {
            SendVideo msg = SendVideo.builder()
                .chatId(chatIdStr)
                .messageThreadId(threadId)
                .replyToMessageId(replyToMessageId)
                .video(new InputFile(sourceMessage.getVideo().getFileId()))
                .caption(sourceMessage.getCaption())
                .build();
            return gateway.safeExecute(msg);
        }
        if (sourceMessage.hasAudio()) {
            SendAudio msg = SendAudio.builder()
                .chatId(chatIdStr)
                .messageThreadId(threadId)
                .replyToMessageId(replyToMessageId)
                .audio(new InputFile(sourceMessage.getAudio().getFileId()))
                .caption(sourceMessage.getCaption())
                .build();
            return gateway.safeExecute(msg);
        }
        if (sourceMessage.hasVoice()) {
            SendVoice msg = SendVoice.builder()
                .chatId(chatIdStr)
                .messageThreadId(threadId)
                .replyToMessageId(replyToMessageId)
                .voice(new InputFile(sourceMessage.getVoice().getFileId()))
                .caption(sourceMessage.getCaption())
                .build();
            return gateway.safeExecute(msg);
        }
        if (sourceMessage.hasAnimation()) {
            SendAnimation msg = SendAnimation.builder()
                .chatId(chatIdStr)
                .messageThreadId(threadId)
                .replyToMessageId(replyToMessageId)
                .animation(new InputFile(sourceMessage.getAnimation().getFileId()))
                .caption(sourceMessage.getCaption())
                .build();
            return gateway.safeExecute(msg);
        }
        if (sourceMessage.hasSticker()) {
            SendSticker msg = SendSticker.builder()
                .chatId(chatIdStr)
                .messageThreadId(threadId)
                .replyToMessageId(replyToMessageId)
                .sticker(new InputFile(sourceMessage.getSticker().getFileId()))
                .build();
            return gateway.safeExecute(msg);
        }
        if (sourceMessage.hasVideoNote()) {
            SendVideoNote msg = SendVideoNote.builder()
                .chatId(chatIdStr)
                .messageThreadId(threadId)
                .replyToMessageId(replyToMessageId)
                .videoNote(new InputFile(sourceMessage.getVideoNote().getFileId()))
                .build();
            return gateway.safeExecute(msg);
        }
        if (sourceMessage.hasContact()) {
            var contact = sourceMessage.getContact();
            SendContact msg = SendContact.builder()
                .chatId(chatIdStr)
                .messageThreadId(threadId)
                .replyToMessageId(replyToMessageId)
                .phoneNumber(contact.getPhoneNumber())
                .firstName(contact.getFirstName())
                .lastName(contact.getLastName())
                .build();
            return gateway.safeExecute(msg);
        }
        if (sourceMessage.hasLocation()) {
            var location = sourceMessage.getLocation();
            SendLocation msg = SendLocation.builder()
                .chatId(chatIdStr)
                .messageThreadId(threadId)
                .replyToMessageId(replyToMessageId)
                .latitude(location.getLatitude())
                .longitude(location.getLongitude())
                .build();
            return gateway.safeExecute(msg);
        }
        return null;
    }

    private void updateAdminMirrorMessage(OrderEntity order, Message message, ChatKey sourceKey, TelegramBotGateway gateway) {
        ChatKey headerKey = state.adminToUserHeaderMap().get(sourceKey);
        if (headerKey != null) {
            String headerText = buildAdminHeaderText(order, message);
            gateway.safeExecute(EditMessageText.builder()
                .chatId(String.valueOf(headerKey.chatId()))
                .messageId(headerKey.messageId())
                .parseMode(ParseMode.HTML)
                .text(headerText)
                .build());
        }

        if (BotMessageUtils.isMediaMessage(message)) {
            ChatKey targetKey = state.adminToUserMap().get(sourceKey);
            if (targetKey != null) {
                updateMirroredCaption(message, targetKey, gateway);
            }
        }
    }

    private void updateUserMirrorMessage(Message message, ChatKey sourceKey, TelegramBotGateway gateway) {
        UUID orderId = state.userMessageOrderMap().get(sourceKey);
        if (orderId == null) {
            return;
        }

        Optional<OrderEntity> orderOpt = orderService.findByUuid(orderId);
        if (orderOpt.isEmpty()) {
            return;
        }
        OrderEntity order = orderOpt.get();
        if (order.getAdminChatId() == null || order.getAdminThreadId() == null) {
            return;
        }

        ChatKey targetKey = state.userToAdminMap().get(sourceKey);
        if (targetKey != null) {
            updateMirroredTextOrCaption(message, targetKey, gateway);
        }
    }

    private void updateMirroredCaption(Message sourceMessage, ChatKey targetKey, TelegramBotGateway gateway) {
        String caption = sourceMessage.getCaption();
        if (caption == null) {
            return;
        }
        gateway.safeExecute(EditMessageCaption.builder()
            .chatId(String.valueOf(targetKey.chatId()))
            .messageId(targetKey.messageId())
            .caption(caption)
            .build());
    }

    private void updateMirroredTextOrCaption(Message sourceMessage, ChatKey targetKey, TelegramBotGateway gateway) {
        if (sourceMessage.hasText()) {
            gateway.safeExecute(EditMessageText.builder()
                .chatId(String.valueOf(targetKey.chatId()))
                .messageId(targetKey.messageId())
                .text(sourceMessage.getText())
                .build());
            return;
        }
        updateMirroredCaption(sourceMessage, targetKey, gateway);
    }

    private String buildAdminHeaderText(OrderEntity order, Message adminMessage) {
        StringBuilder sb = new StringBuilder();
        sb.append("📩 <b>Сообщение от администратора</b>\n");
        sb.append("Заказ <code>").append(BotMessageUtils.escapeHtml(order.uuid().toString())).append("</code>\n");
        sb.append("══════════════════\n");
        String content = BotMessageUtils.extractMessageBody(adminMessage);
        if (content != null && !content.isBlank()) {
            sb.append("<blockquote>")
                .append(BotMessageUtils.escapeHtml(content))
                .append("</blockquote>\n");
        } else {
            sb.append("<i>Администратор отправил вложение.</i>\n");
        }
        sb.append("══════════════════\n");
        sb.append("Если хотите ответить, напишите реплаем на это сообщение.");
        return sb.toString();
    }

    private String buildUserHeaderText(OrderEntity order) {
        StringBuilder sb = new StringBuilder();
        sb.append("👤 <b>Сообщение от пользователя</b>\n");
        sb.append("Заказ <code>").append(BotMessageUtils.escapeHtml(order.uuid().toString())).append("</code>\n");
        sb.append("Покупатель: ").append(BotMessageUtils.escapeHtml(order.getCustomerName())).append("\n");
        sb.append("TG: ").append(BotMessageUtils.buildUserReference(order.getTgUserId(), order.getTgUsername()));
        return sb.toString();
    }

    private boolean isAdmin(long userId) {
        Set<Long> admins = props.getTelegram().adminUserIdSet();
        return admins.contains(userId);
    }
}
