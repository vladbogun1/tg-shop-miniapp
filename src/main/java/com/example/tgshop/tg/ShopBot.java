package com.example.tgshop.tg;

import com.example.tgshop.config.AppProperties;
import com.example.tgshop.order.OrderEntity;
import com.example.tgshop.order.OrderService; // <-- добавь свой сервис
import com.example.tgshop.settings.Setting;
import com.example.tgshop.settings.SettingRepository;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.bots.TelegramLongPollingBot;
import org.telegram.telegrambots.meta.api.methods.AnswerCallbackQuery;
import org.telegram.telegrambots.meta.api.methods.ParseMode;
import org.telegram.telegrambots.meta.api.methods.copy.CopyMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.DeleteMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageCaption;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageText;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageReplyMarkup;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.MessageId;
import org.telegram.telegrambots.meta.api.objects.Update;
import org.telegram.telegrambots.meta.api.objects.User;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.ForceReplyKeyboard;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.api.objects.webapp.WebAppInfo;

@Component
@Slf4j
public class ShopBot extends TelegramLongPollingBot {

    private final AppProperties props;
    private final SettingRepository settings;
    private final OrderService orderService;
    private final Map<Integer, PendingShipment> pendingShipments = new ConcurrentHashMap<>();
    private final Map<Integer, PendingRejection> pendingRejections = new ConcurrentHashMap<>();
    private final Map<ChatKey, ChatKey> adminToUserMap = new ConcurrentHashMap<>();
    private final Map<ChatKey, ChatKey> adminToUserHeaderMap = new ConcurrentHashMap<>();
    private final Map<ChatKey, ChatKey> userToAdminMap = new ConcurrentHashMap<>();
    private final Map<ChatKey, UUID> replyAnchorMap = new ConcurrentHashMap<>();
    private final Map<ChatKey, UUID> userMessageOrderMap = new ConcurrentHashMap<>();

    public ShopBot(
        AppProperties props,
        SettingRepository settings,
        @Lazy TelegramNotifyService notifyService,
        OrderService orderService
    ) {
        super(props.getTelegram().getBotToken());
        this.props = props;
        this.settings = settings;
        this.orderService = orderService;
    }

    @Override
    public String getBotUsername() {
        return props.getTelegram().getBotUsername();
    }

    @Override
    public void onUpdateReceived(Update update) {
        if (update == null) return;

        if (update.hasEditedMessage()) {
            handleEditedMessage(update.getEditedMessage());
            return;
        }

        // 1) inline callbacks (approve/reject)
        if (update.hasCallbackQuery()) {
            log.info("🤖 TG Received callback query update");
            handleCallback(update);
            return;
        }

        // 2) обычные сообщения
        if (!update.hasMessage()) return;

        Message message = update.getMessage();
        long chatId = message.getChatId();
        var from = message.getFrom();
        long userId = from != null ? from.getId() : 0;

        if (handleOrderChatMessage(message, userId)) {
            return;
        }
        if (handleUserReplyToAdmin(message)) {
            return;
        }

        if (!message.hasText()) return;

        String text = message.getText().trim();

        log.info("🤖 TG Received message command={} chatId={} userId={}", text, chatId, userId);
        if (handleRejectReply(update, userId)) {
            return;
        }
        if (handleTrackingReply(update, userId)) {
            return;
        }
        switch (text) {
            case "/start", "/shop" -> sendShopButton(chatId);
            case "/set_admin_chat" -> {
                if (!isAdmin(userId)) {
                    log.warn("🤖 TG Admin chat setup rejected for non-admin userId={}", userId);
                    safeExecute(SendMessage.builder().chatId(chatId).text("⛔ Нет доступа").build());
                    return;
                }
                settings.save(new Setting("ADMIN_CHAT_ID", String.valueOf(chatId)));
                log.info("🤖 TG Admin chat configured chatId={} userId={}", chatId, userId);
                safeExecute(SendMessage.builder().chatId(chatId).text("✅ Этот чат теперь будет получать уведомления о заказах.").build());
            }
            case "/help" -> safeExecute(SendMessage.builder().chatId(chatId).text(
                    "Доступные команды:\n" +
                            "/shop — открыть магазин\n" +
                            "/set_admin_chat — куда слать уведомления о заказах (выполнить в нужном чате)\n" +
                            "/help"
            ).build());
        }
    }

    private void handleEditedMessage(Message message) {
        if (message == null) {
            return;
        }

        User from = message.getFrom();
        if (from == null || Boolean.TRUE.equals(from.getIsBot())) {
            return;
        }

        ChatKey sourceKey = new ChatKey(message.getChatId(), message.getMessageId());
        if (message.getMessageThreadId() != null && isAdmin(from.getId())) {
            Optional<OrderEntity> orderOpt = orderService.findByAdminThread(message.getChatId(), message.getMessageThreadId());
            if (orderOpt.isPresent()) {
                OrderEntity order = orderOpt.get();
                updateAdminMirrorMessage(order, message, sourceKey);
                return;
            }
        }

        if (userToAdminMap.containsKey(sourceKey)) {
            updateUserMirrorMessage(message, sourceKey);
        }
    }

    private boolean handleOrderChatMessage(Message message, long userId) {
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
        Message headerMessage = sendAdminHeaderToUser(order, message);
        if (headerMessage == null) {
            return true;
        }

        ChatKey headerKey = new ChatKey(headerMessage.getChatId(), headerMessage.getMessageId());
        adminToUserHeaderMap.put(sourceKey, headerKey);
        replyAnchorMap.put(headerKey, order.uuid());

        if (isMediaMessage(message)) {
            MessageId copied = copyMessageToUser(order.getTgUserId(), message, headerMessage.getMessageId());
            if (copied != null) {
                ChatKey targetKey = new ChatKey(order.getTgUserId(), copied.getMessageId());
                adminToUserMap.put(sourceKey, targetKey);
            }
        } else {
            adminToUserMap.put(sourceKey, headerKey);
        }

        return true;
    }

    private boolean handleUserReplyToAdmin(Message message) {
        if (message == null || message.getReplyToMessage() == null) {
            return false;
        }
        if (message.getFrom() == null || Boolean.TRUE.equals(message.getFrom().getIsBot())) {
            return false;
        }

        ChatKey replyKey = new ChatKey(message.getChatId(), message.getReplyToMessage().getMessageId());
        UUID orderId = replyAnchorMap.get(replyKey);
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

        MessageId copied = copyMessageToAdmin(order, message);
        if (copied != null) {
            ChatKey sourceKey = new ChatKey(message.getChatId(), message.getMessageId());
            ChatKey targetKey = new ChatKey(order.getAdminChatId(), copied.getMessageId());
            userToAdminMap.put(sourceKey, targetKey);
            userMessageOrderMap.put(sourceKey, order.uuid());
        }
        return true;
    }

    private Message sendAdminHeaderToUser(OrderEntity order, Message adminMessage) {
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
        return safeExecuteMessage(header);
    }

    private MessageId copyMessageToUser(long userId, Message sourceMessage, Integer replyToMessageId) {
        CopyMessage copy = CopyMessage.builder()
            .chatId(String.valueOf(userId))
            .fromChatId(String.valueOf(sourceMessage.getChatId()))
            .messageId(sourceMessage.getMessageId())
            .replyToMessageId(replyToMessageId)
            .build();
        return safeExecute(copy);
    }

    private MessageId copyMessageToAdmin(OrderEntity order, Message sourceMessage) {
        CopyMessage copy = CopyMessage.builder()
            .chatId(String.valueOf(order.getAdminChatId()))
            .fromChatId(String.valueOf(sourceMessage.getChatId()))
            .messageId(sourceMessage.getMessageId())
            .messageThreadId(order.getAdminThreadId())
            .build();
        return safeExecute(copy);
    }

    private void updateAdminMirrorMessage(OrderEntity order, Message message, ChatKey sourceKey) {
        ChatKey headerKey = adminToUserHeaderMap.get(sourceKey);
        if (headerKey != null) {
            String headerText = buildAdminHeaderText(order, message);
            safeExecute(EditMessageText.builder()
                .chatId(String.valueOf(headerKey.chatId()))
                .messageId(headerKey.messageId())
                .parseMode(ParseMode.HTML)
                .text(headerText)
                .build());
        }

        if (isMediaMessage(message)) {
            ChatKey targetKey = adminToUserMap.get(sourceKey);
            if (targetKey != null) {
                safeExecute(DeleteMessage.builder()
                    .chatId(String.valueOf(targetKey.chatId()))
                    .messageId(targetKey.messageId())
                    .build());
            }
            Integer replyTo = headerKey != null ? headerKey.messageId() : null;
            MessageId copied = copyMessageToUser(order.getTgUserId(), message, replyTo);
            if (copied != null) {
                adminToUserMap.put(sourceKey, new ChatKey(order.getTgUserId(), copied.getMessageId()));
            }
        }
    }

    private void updateUserMirrorMessage(Message message, ChatKey sourceKey) {
        UUID orderId = userMessageOrderMap.get(sourceKey);
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

        ChatKey targetKey = userToAdminMap.get(sourceKey);
        if (targetKey != null) {
            safeExecute(DeleteMessage.builder()
                .chatId(String.valueOf(targetKey.chatId()))
                .messageId(targetKey.messageId())
                .build());
        }
        MessageId copied = copyMessageToAdmin(order, message);
        if (copied != null) {
            userToAdminMap.put(sourceKey, new ChatKey(order.getAdminChatId(), copied.getMessageId()));
        }
    }

    private String buildAdminHeaderText(OrderEntity order, Message adminMessage) {
        StringBuilder sb = new StringBuilder();
        sb.append("📩 <b>Сообщение от администратора</b>\n");
        sb.append("Заказ <code>").append(escapeHtml(order.uuid().toString())).append("</code>\n");
        sb.append("══════════════════\n");
        String content = extractMessageBody(adminMessage);
        if (content != null && !content.isBlank()) {
            sb.append("<blockquote>")
                .append(escapeHtml(content))
                .append("</blockquote>\n");
        } else {
            sb.append("<i>Администратор отправил вложение.</i>\n");
        }
        sb.append("══════════════════\n");
        sb.append("Если хотите ответить, напишите реплаем на это сообщение.");
        return sb.toString();
    }

    private static String extractMessageBody(Message message) {
        if (message == null) {
            return null;
        }
        if (message.hasText()) {
            return message.getText();
        }
        if (message.getCaption() != null) {
            return message.getCaption();
        }
        return null;
    }

    private static boolean isMediaMessage(Message message) {
        if (message == null) {
            return false;
        }
        return message.hasPhoto()
            || message.hasDocument()
            || message.hasVideo()
            || message.hasAudio()
            || message.hasVoice()
            || message.hasAnimation()
            || message.hasVideoNote()
            || message.hasSticker()
            || message.hasContact()
            || message.hasLocation()
            || message.hasVenue()
            || message.hasPoll();
    }

    private void handleCallback(Update update) {
        var cb = update.getCallbackQuery();
        String data = cb.getData();
        long fromUserId = cb.getFrom() != null ? cb.getFrom().getId() : 0;

        // кто нажал — не админ
        if (!isAdmin(fromUserId)) {
            log.warn("🤖 TG Callback rejected for non-admin userId={}", fromUserId);
            safeExecute(AnswerCallbackQuery.builder()
                .callbackQueryId(cb.getId())
                .text("⛔ Нет доступа")
                .showAlert(true)
                .build());
            return;
        }

        // разбор callback data
        TelegramNotifyService.OrderDecision decision;
        String uuidStr;

        if (data != null && data.startsWith(TelegramNotifyService.CB_APPROVE_PREFIX)) {
            decision = TelegramNotifyService.OrderDecision.APPROVED;
            uuidStr = data.substring(TelegramNotifyService.CB_APPROVE_PREFIX.length());
        } else if (data != null && data.startsWith(TelegramNotifyService.CB_REJECT_PREFIX)) {
            decision = TelegramNotifyService.OrderDecision.REJECTED;
            uuidStr = data.substring(TelegramNotifyService.CB_REJECT_PREFIX.length());
        } else if (data != null && data.startsWith(TelegramNotifyService.CB_SHIP_PREFIX)) {
            decision = null;
            uuidStr = data.substring(TelegramNotifyService.CB_SHIP_PREFIX.length());
        } else {
            log.warn("🤖 TG Callback rejected: unknown data {}", data);
            safeExecute(AnswerCallbackQuery.builder()
                .callbackQueryId(cb.getId())
                .text("Неизвестная команда")
                .build());
            return;
        }

        UUID uuid;
        try {
            uuid = UUID.fromString(uuidStr);
        } catch (Exception e) {
            log.warn("🤖 TG Callback rejected: invalid uuid {}", uuidStr);
            safeExecute(AnswerCallbackQuery.builder()
                .callbackQueryId(cb.getId())
                .text("Некорректный ID заказа")
                .build());
            return;
        }

        try {
            if (decision == null) {
                sendTrackingNumberRequest(cb, uuid);
                return;
            }
            if (decision == TelegramNotifyService.OrderDecision.REJECTED) {
                sendRejectReasonRequest(cb, uuid);
                return;
            }
            // обновляем статус в БД
            OrderEntity updated = orderService.approve(uuid);

            log.info("🤖 TG Order decision applied uuid={} decision={}", updated.uuid(), decision);

            // обновим сообщение в админ-чате (подпишем статус + уберем кнопки)
            String newText = buildAdminDecisionText(updated, decision, null, null);
            safeExecute(EditMessageText.builder()
                .chatId(String.valueOf(cb.getMessage().getChatId()))
                .messageId(cb.getMessage().getMessageId())
                .parseMode(ParseMode.HTML)
                .text(newText)
                .build());

            var shipButton = InlineKeyboardButton.builder()
                .text("📦 Выслал заказ")
                .callbackData(TelegramNotifyService.CB_SHIP_PREFIX + updated.uuid().toString())
                .build();
            var rejectButton = buildRejectButton(updated.uuid());
            InlineKeyboardMarkup kb = buildAdminOrderKeyboard(List.of(shipButton, rejectButton), updated);
            safeExecute(EditMessageReplyMarkup.builder()
                .chatId(String.valueOf(cb.getMessage().getChatId()))
                .messageId(cb.getMessage().getMessageId())
                .replyMarkup(kb)
                .build());

            safeExecute(AnswerCallbackQuery.builder()
                .callbackQueryId(cb.getId())
                .text("✅ Одобрено")
                .build());

        } catch (Exception e) {
            log.error("🤖 TG Failed to handle callback decision uuid={} decision={}", uuidStr, decision, e);
            safeExecute(AnswerCallbackQuery.builder()
                .callbackQueryId(cb.getId())
                .text("Ошибка при обновлении заказа")
                .showAlert(true)
                .build());
        }
    }

    private String buildAdminDecisionText(OrderEntity order, TelegramNotifyService.OrderDecision decision) {
        String status = decision == TelegramNotifyService.OrderDecision.APPROVED
            ? "✅ <b>ОДОБРЕНО</b>"
            : "❌ <b>ОТКЛОНЕНО</b>";
        return buildAdminDecisionText(order, decision, status, null);
    }

    private String buildAdminDecisionText(OrderEntity order,
                                          TelegramNotifyService.OrderDecision decision,
                                          String statusOverride,
                                          String rejectReason) {
        String status = statusOverride != null ? statusOverride : decision == TelegramNotifyService.OrderDecision.APPROVED
            ? "✅ <b>ОДОБРЕНО</b>"
            : "❌ <b>ОТКЛОНЕНО</b>";
        // Можно оставить тот же текст заказа + добавить статус сверху
        StringBuilder sb = new StringBuilder();
        sb.append(status).append("\n\n");
        sb.append("<b>🛒 Заказ</b>\n");
        sb.append("ID: <code>").append(escapeHtml(order.uuid().toString())).append("</code>\n\n");
        sb.append("👤 ").append(escapeHtml(order.getCustomerName())).append("\n");
        sb.append("📞 ").append(escapeHtml(order.getPhone())).append("\n");
        sb.append("📦 ").append(escapeHtml(order.getAddress())).append("\n");
        if (order.getComment() != null && !order.getComment().isBlank()) {
          sb.append("💬 ").append(escapeHtml(order.getComment())).append("\n");
        }
        sb.append("\n<b>🧾 Состав:</b>\n");
        order.getItems().forEach(i -> {
          long lineTotal = i.getPriceMinorSnapshot() * (long) i.getQuantity();
          sb.append("• ")
              .append(escapeHtml(i.getTitleSnapshot()))
              .append(i.getVariantNameSnapshot() != null && !i.getVariantNameSnapshot().isBlank()
                  ? " (" + escapeHtml(i.getVariantNameSnapshot()) + ")"
                  : "")
              .append(" × ")
              .append(i.getQuantity())
              .append(" — ")
              .append(lineTotal)
              .append(" ")
              .append(escapeHtml(order.getCurrency()))
              .append("\n");
        });
        sb.append("\n<b>💰 Итого:</b> ")
            .append(order.getTotalMinor())
            .append(" ")
            .append(escapeHtml(order.getCurrency()))
            .append("\n");
        if (order.getDiscountMinor() > 0) {
          sb.append("Скидка: -")
              .append(order.getDiscountMinor())
              .append(" ")
              .append(escapeHtml(order.getCurrency()))
              .append("\n");
        }
        if (order.getPromoCode() != null && !order.getPromoCode().isBlank()) {
          sb.append("Промокод: ").append(escapeHtml(order.getPromoCode())).append("\n");
        }
        if (order.getTrackingNumber() != null && !order.getTrackingNumber().isBlank()) {
          sb.append("\n📦 ТТН: ").append(escapeHtml(order.getTrackingNumber())).append("\n");
        }
        if (rejectReason != null && !rejectReason.isBlank()) {
          sb.append("\n❌ Причина: ").append(escapeHtml(rejectReason)).append("\n");
        }

        sb.append("\n👤 TG: ").append(buildUserReference(order.getTgUserId(), order.getTgUsername()));
        sb.append("\n");

        return sb.toString();
    }

    private void sendTrackingNumberRequest(org.telegram.telegrambots.meta.api.objects.CallbackQuery cb, UUID uuid) {
        ForceReplyKeyboard forceReply = ForceReplyKeyboard.builder()
            .forceReply(true)
            .selective(true)
            .build();

        SendMessage prompt = SendMessage.builder()
            .chatId(String.valueOf(cb.getMessage().getChatId()))
            .parseMode(ParseMode.HTML)
            .text("Введите ТТН для заказа <code>" + escapeHtml(uuid.toString()) + "</code>")
            .replyMarkup(forceReply)
            .build();

        Message promptMessage = safeExecuteMessage(prompt);
        if (promptMessage != null) {
            pendingShipments.put(promptMessage.getMessageId(), new PendingShipment(
                uuid,
                cb.getMessage().getChatId(),
                cb.getMessage().getMessageId()
            ));
        }

        safeExecute(AnswerCallbackQuery.builder()
            .callbackQueryId(cb.getId())
            .text("Введите ТТН")
            .build());
    }

    private void sendRejectReasonRequest(org.telegram.telegrambots.meta.api.objects.CallbackQuery cb, UUID uuid) {
        ForceReplyKeyboard forceReply = ForceReplyKeyboard.builder()
            .forceReply(true)
            .selective(true)
            .build();

        SendMessage prompt = SendMessage.builder()
            .chatId(String.valueOf(cb.getMessage().getChatId()))
            .parseMode(ParseMode.HTML)
            .text("Напишите причину отклонения для заказа <code>" + escapeHtml(uuid.toString()) + "</code>")
            .replyMarkup(forceReply)
            .build();

        Message promptMessage = safeExecuteMessage(prompt);
        if (promptMessage != null) {
            pendingRejections.put(promptMessage.getMessageId(), new PendingRejection(
                uuid,
                cb.getMessage().getChatId(),
                cb.getMessage().getMessageId()
            ));
        }

        safeExecute(AnswerCallbackQuery.builder()
            .callbackQueryId(cb.getId())
            .text("Укажите причину")
            .build());
    }

    private boolean handleTrackingReply(Update update, long userId) {
        var message = update.getMessage();
        if (message == null || !message.hasText() || message.getReplyToMessage() == null) {
            return false;
        }
        if (!isAdmin(userId)) {
            return false;
        }

        PendingShipment pending = pendingShipments.remove(message.getReplyToMessage().getMessageId());
        if (pending == null) {
            return false;
        }

        String trackingNumber = message.getText().trim();
        if (trackingNumber.isBlank()) {
            safeExecute(DeleteMessage.builder()
                .chatId(String.valueOf(message.getChatId()))
                .messageId(message.getMessageId())
                .build());
            return true;
        }

        try {
            OrderEntity shipped = orderService.ship(pending.orderId(), trackingNumber);
            String newText = buildAdminDecisionText(shipped, TelegramNotifyService.OrderDecision.APPROVED, "📦 <b>ВЫСЛАНО</b>", null);
            safeExecute(EditMessageText.builder()
                .chatId(String.valueOf(pending.chatId()))
                .messageId(pending.orderMessageId())
                .parseMode(ParseMode.HTML)
                .text(newText)
                .build());
            var rejectButton = buildRejectButton(shipped.uuid());
            InlineKeyboardMarkup kb = buildAdminOrderKeyboard(List.of(rejectButton), shipped);
            safeExecute(EditMessageReplyMarkup.builder()
                .chatId(String.valueOf(pending.chatId()))
                .messageId(pending.orderMessageId())
                .replyMarkup(kb)
                .build());
        } catch (Exception e) {
            log.error("🤖 TG Failed to ship order from reply tracking number", e);
            safeExecute(SendMessage.builder()
                .chatId(String.valueOf(message.getChatId()))
                .text("Ошибка при обновлении заказа. Проверьте ТТН и попробуйте еще раз.")
                .build());
        } finally {
            safeExecute(DeleteMessage.builder()
                .chatId(String.valueOf(message.getChatId()))
                .messageId(message.getMessageId())
                .build());
            safeExecute(DeleteMessage.builder()
                .chatId(String.valueOf(message.getChatId()))
                .messageId(message.getReplyToMessage().getMessageId())
                .build());
        }

        return true;
    }

    private boolean handleRejectReply(Update update, long userId) {
        var message = update.getMessage();
        if (message == null || !message.hasText() || message.getReplyToMessage() == null) {
            return false;
        }
        if (!isAdmin(userId)) {
            return false;
        }

        PendingRejection pending = pendingRejections.remove(message.getReplyToMessage().getMessageId());
        if (pending == null) {
            return false;
        }

        String reason = message.getText().trim();
        if (reason.isBlank()) {
            safeExecute(DeleteMessage.builder()
                .chatId(String.valueOf(message.getChatId()))
                .messageId(message.getMessageId())
                .build());
            return true;
        }

        try {
            OrderEntity rejected = orderService.reject(pending.orderId(), reason);
            String newText = buildAdminDecisionText(rejected, TelegramNotifyService.OrderDecision.REJECTED, null, reason);
            safeExecute(EditMessageText.builder()
                .chatId(String.valueOf(pending.chatId()))
                .messageId(pending.orderMessageId())
                .parseMode(ParseMode.HTML)
                .text(newText)
                .build());
            InlineKeyboardMarkup kb = buildAdminOrderKeyboard(List.of(), rejected);
            safeExecute(EditMessageReplyMarkup.builder()
                .chatId(String.valueOf(pending.chatId()))
                .messageId(pending.orderMessageId())
                .replyMarkup(kb)
                .build());
        } catch (Exception e) {
            log.error("🤖 TG Failed to reject order from reply reason", e);
            safeExecute(SendMessage.builder()
                .chatId(String.valueOf(message.getChatId()))
                .text("Ошибка при отклонении заказа. Попробуйте снова.")
                .build());
        } finally {
            safeExecute(DeleteMessage.builder()
                .chatId(String.valueOf(message.getChatId()))
                .messageId(message.getMessageId())
                .build());
            safeExecute(DeleteMessage.builder()
                .chatId(String.valueOf(message.getChatId()))
                .messageId(message.getReplyToMessage().getMessageId())
                .build());
        }

        return true;
    }

    private InlineKeyboardButton buildRejectButton(UUID uuid) {
        return InlineKeyboardButton.builder()
            .text("❌ Отклонить")
            .callbackData(TelegramNotifyService.CB_REJECT_PREFIX + uuid.toString())
            .build();
    }

    private InlineKeyboardMarkup buildAdminOrderKeyboard(List<InlineKeyboardButton> actionButtons, OrderEntity order) {
        InlineKeyboardButton chatButton = buildOrderChatButton(order);
        if (chatButton != null) {
            if (actionButtons.isEmpty()) {
                return InlineKeyboardMarkup.builder()
                    .keyboard(List.of(List.of(chatButton)))
                    .build();
            }
            return InlineKeyboardMarkup.builder()
                .keyboard(List.of(actionButtons, List.of(chatButton)))
                .build();
        }
        if (actionButtons.isEmpty()) {
            return null;
        }
        return InlineKeyboardMarkup.builder()
            .keyboard(List.of(actionButtons))
            .build();
    }

    private InlineKeyboardButton buildOrderChatButton(OrderEntity order) {
        if (order.getAdminChatId() == null || order.getAdminThreadId() == null) {
            return null;
        }
        String link = buildTopicLink(order.getAdminChatId(), order.getAdminThreadId());
        if (link == null) {
            return null;
        }
        return InlineKeyboardButton.builder()
            .text("💬 В чат заказа")
            .url(link)
            .build();
    }

    private void sendShopButton(long chatId) {
        String url = props.getWebapp().getBaseUrl() + "/app/index.html?mode=user";
        var btn = InlineKeyboardButton.builder()
                .text("🛍️ Открыть магазин")
                .webApp(new WebAppInfo(url))
                .build();

        var kb = InlineKeyboardMarkup.builder()
                .keyboardRow(List.of(btn))
                .build();

        log.info("🤖 TG Sending shop button to chatId={}", chatId);
        safeExecute(SendMessage.builder()
                .chatId(chatId)
                .text("Открывай мини-приложение магазина 👇")
                .replyMarkup(kb)
                .build());
    }

    private boolean isAdmin(long userId) {
        Set<Long> admins = props.getTelegram().adminUserIdSet();
        return admins.contains(userId);
    }

    private static String buildUserReference(long userId, String username) {
        StringBuilder sb = new StringBuilder();
        sb.append("<a href=\"tg://user?id=")
            .append(userId)
            .append("\">")
            .append(escapeHtml(String.valueOf(userId)))
            .append("</a>");
        if (username != null && !username.isBlank()) {
            sb.append(" (@").append(escapeHtml(username)).append(")");
        }
        return sb.toString();
    }

    public void safeExecute(SendMessage msg) {
        try {
            execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to send message", e);
        }
    }

    public void safeExecute(AnswerCallbackQuery msg) {
        try {
            execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to answer callback query", e);
        }
    }

    public void safeExecute(EditMessageText msg) {
        try {
            execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to edit message text", e);
        }
    }

    public void safeExecute(EditMessageCaption msg) {
        try {
            execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to edit message caption", e);
        }
    }

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

    public void safeExecute(DeleteMessage msg) {
        try {
            execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to delete message", e);
        }
    }

    public Message safeExecuteMessage(SendMessage msg) {
        try {
            return execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to send message", e);
            return null;
        }
    }

    public org.telegram.telegrambots.meta.api.objects.forum.ForumTopic safeExecute(
        org.telegram.telegrambots.meta.api.methods.forum.CreateForumTopic msg
    ) {
        try {
            return execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to create forum topic", e);
            return null;
        }
    }

    public MessageId safeExecute(CopyMessage msg) {
        try {
            return execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to copy message", e);
            return null;
        }
    }

    private static String escapeHtml(String s) {
      if (s == null) return "";
      return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private static String buildTopicLink(long chatId, int threadId) {
        String abs = String.valueOf(Math.abs(chatId));
        String chatPart = abs.startsWith("100") ? abs.substring(3) : abs;
        return "https://t.me/c/" + chatPart + "/" + threadId;
    }

    private record PendingShipment(UUID orderId, long chatId, int orderMessageId) {}
    private record PendingRejection(UUID orderId, long chatId, int orderMessageId) {}
    private record ChatKey(long chatId, int messageId) {}
}
