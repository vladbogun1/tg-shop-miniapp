package com.example.tgshop.tg.handlers;

import com.example.tgshop.config.AppProperties;
import com.example.tgshop.order.OrderEntity;
import com.example.tgshop.order.OrderService;
import com.example.tgshop.tg.TelegramNotifyService;
import com.example.tgshop.tg.bot.BotMessageUtils;
import com.example.tgshop.tg.bot.BotState;
import com.example.tgshop.tg.bot.BotState.ChatKey;
import com.example.tgshop.tg.bot.BotState.PendingRejection;
import com.example.tgshop.tg.bot.BotState.PendingShipment;
import com.example.tgshop.tg.bot.TelegramBotGateway;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.meta.api.methods.AnswerCallbackQuery;
import org.telegram.telegrambots.meta.api.methods.ParseMode;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.DeleteMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageReplyMarkup;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageText;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.Update;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.ForceReplyKeyboard;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;

@Component
@Slf4j
public class OrderDecisionHandler {
    private final AppProperties props;
    private final OrderService orderService;
    private final TelegramNotifyService notifyService;
    private final BotState state;

    public OrderDecisionHandler(
        AppProperties props,
        OrderService orderService,
        TelegramNotifyService notifyService,
        BotState state
    ) {
        this.props = props;
        this.orderService = orderService;
        this.notifyService = notifyService;
        this.state = state;
    }

    public boolean handleCallback(Update update, TelegramBotGateway gateway) {
        var cb = update.getCallbackQuery();
        if (cb == null) {
            return false;
        }
        String data = cb.getData();
        long fromUserId = cb.getFrom() != null ? cb.getFrom().getId() : 0;

        if (!isAdmin(fromUserId)) {
            log.warn("🤖 TG Callback rejected for non-admin userId={}", fromUserId);
            gateway.safeExecute(AnswerCallbackQuery.builder()
                .callbackQueryId(cb.getId())
                .text("⛔ Нет доступа")
                .showAlert(true)
                .build());
            return true;
        }

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
        } else if (data != null && data.startsWith(TelegramNotifyService.CB_INVOICE_PREFIX)) {
            decision = null;
            uuidStr = data.substring(TelegramNotifyService.CB_INVOICE_PREFIX.length());
        } else {
            log.warn("🤖 TG Callback rejected: unknown data {}", data);
            gateway.safeExecute(AnswerCallbackQuery.builder()
                .callbackQueryId(cb.getId())
                .text("Неизвестная команда")
                .build());
            return true;
        }

        UUID uuid;
        try {
            uuid = UUID.fromString(uuidStr);
        } catch (Exception e) {
            log.warn("🤖 TG Callback rejected: invalid uuid {}", uuidStr);
            gateway.safeExecute(AnswerCallbackQuery.builder()
                .callbackQueryId(cb.getId())
                .text("Некорректный ID заказа")
                .build());
            return true;
        }

        try {
            if (data != null && data.startsWith(TelegramNotifyService.CB_INVOICE_PREFIX)) {
                orderService.findByUuid(uuid).ifPresentOrElse(order -> {
                    Message sent = notifyService.notifyUserPaymentRequest(order);
                    if (sent != null) {
                        state.replyAnchorMap().put(new ChatKey(order.getTgUserId(), sent.getMessageId()), order.uuid());
                    }
                    gateway.safeExecute(AnswerCallbackQuery.builder()
                        .callbackQueryId(cb.getId())
                        .text("✅ Счёт отправлен")
                        .build());
                }, () -> gateway.safeExecute(AnswerCallbackQuery.builder()
                    .callbackQueryId(cb.getId())
                    .text("Заказ не найден")
                    .showAlert(true)
                    .build()));
                return true;
            }
            if (decision == null) {
                sendTrackingNumberRequest(cb, uuid, gateway);
                return true;
            }
            if (decision == TelegramNotifyService.OrderDecision.REJECTED) {
                sendRejectReasonRequest(cb, uuid, gateway);
                return true;
            }

            OrderEntity updated = orderService.approve(uuid);
            log.info("🤖 TG Order decision applied uuid={} decision={}", updated.uuid(), decision);

            String newText = buildAdminDecisionText(updated, decision, null, null);
            gateway.safeExecute(EditMessageText.builder()
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
            gateway.safeExecute(EditMessageReplyMarkup.builder()
                .chatId(String.valueOf(cb.getMessage().getChatId()))
                .messageId(cb.getMessage().getMessageId())
                .replyMarkup(kb)
                .build());

            gateway.safeExecute(AnswerCallbackQuery.builder()
                .callbackQueryId(cb.getId())
                .text("✅ Одобрено")
                .build());
        } catch (Exception e) {
            log.error("🤖 TG Failed to handle callback decision uuid={} decision={}", uuidStr, decision, e);
            gateway.safeExecute(AnswerCallbackQuery.builder()
                .callbackQueryId(cb.getId())
                .text("Ошибка при обновлении заказа")
                .showAlert(true)
                .build());
        }
        return true;
    }

    public boolean handleTrackingReply(Update update, long userId, TelegramBotGateway gateway) {
        var message = update.getMessage();
        if (message == null || !message.hasText() || message.getReplyToMessage() == null) {
            return false;
        }
        if (!isAdmin(userId)) {
            return false;
        }

        PendingShipment pending = state.pendingShipments().remove(message.getReplyToMessage().getMessageId());
        if (pending == null) {
            return false;
        }

        String trackingNumber = message.getText().trim();
        if (trackingNumber.isBlank()) {
            gateway.safeExecute(DeleteMessage.builder()
                .chatId(String.valueOf(message.getChatId()))
                .messageId(message.getMessageId())
                .build());
            return true;
        }

        try {
            OrderEntity shipped = orderService.ship(pending.orderId(), trackingNumber);
            String newText = buildAdminDecisionText(
                shipped,
                TelegramNotifyService.OrderDecision.APPROVED,
                "📦 <b>ВЫСЛАНО</b>",
                null
            );
            gateway.safeExecute(EditMessageText.builder()
                .chatId(String.valueOf(pending.chatId()))
                .messageId(pending.orderMessageId())
                .parseMode(ParseMode.HTML)
                .text(newText)
                .build());
            var rejectButton = buildRejectButton(shipped.uuid());
            InlineKeyboardMarkup kb = buildAdminOrderKeyboard(List.of(rejectButton), shipped);
            gateway.safeExecute(EditMessageReplyMarkup.builder()
                .chatId(String.valueOf(pending.chatId()))
                .messageId(pending.orderMessageId())
                .replyMarkup(kb)
                .build());
        } catch (Exception e) {
            log.error("🤖 TG Failed to ship order from reply tracking number", e);
            gateway.safeExecute(SendMessage.builder()
                .chatId(String.valueOf(message.getChatId()))
                .text("Ошибка при обновлении заказа. Проверьте ТТН и попробуйте еще раз.")
                .build());
        } finally {
            gateway.safeExecute(DeleteMessage.builder()
                .chatId(String.valueOf(message.getChatId()))
                .messageId(message.getMessageId())
                .build());
            gateway.safeExecute(DeleteMessage.builder()
                .chatId(String.valueOf(message.getChatId()))
                .messageId(message.getReplyToMessage().getMessageId())
                .build());
        }

        return true;
    }

    public boolean handleRejectReply(Update update, long userId, TelegramBotGateway gateway) {
        var message = update.getMessage();
        if (message == null || !message.hasText() || message.getReplyToMessage() == null) {
            return false;
        }
        if (!isAdmin(userId)) {
            return false;
        }

        PendingRejection pending = state.pendingRejections().remove(message.getReplyToMessage().getMessageId());
        if (pending == null) {
            return false;
        }

        String reason = message.getText().trim();
        if (reason.isBlank()) {
            gateway.safeExecute(DeleteMessage.builder()
                .chatId(String.valueOf(message.getChatId()))
                .messageId(message.getMessageId())
                .build());
            return true;
        }

        try {
            OrderEntity rejected = orderService.reject(pending.orderId(), reason);
            String newText = buildAdminDecisionText(
                rejected,
                TelegramNotifyService.OrderDecision.REJECTED,
                null,
                reason
            );
            gateway.safeExecute(EditMessageText.builder()
                .chatId(String.valueOf(pending.chatId()))
                .messageId(pending.orderMessageId())
                .parseMode(ParseMode.HTML)
                .text(newText)
                .build());
            InlineKeyboardMarkup kb = buildAdminOrderKeyboard(List.of(), rejected);
            gateway.safeExecute(EditMessageReplyMarkup.builder()
                .chatId(String.valueOf(pending.chatId()))
                .messageId(pending.orderMessageId())
                .replyMarkup(kb)
                .build());
        } catch (Exception e) {
            log.error("🤖 TG Failed to reject order from reply reason", e);
            gateway.safeExecute(SendMessage.builder()
                .chatId(String.valueOf(message.getChatId()))
                .text("Ошибка при отклонении заказа. Попробуйте снова.")
                .build());
        } finally {
            gateway.safeExecute(DeleteMessage.builder()
                .chatId(String.valueOf(message.getChatId()))
                .messageId(message.getMessageId())
                .build());
            gateway.safeExecute(DeleteMessage.builder()
                .chatId(String.valueOf(message.getChatId()))
                .messageId(message.getReplyToMessage().getMessageId())
                .build());
        }

        return true;
    }

    private String buildAdminDecisionText(
        OrderEntity order,
        TelegramNotifyService.OrderDecision decision,
        String statusOverride,
        String rejectReason
    ) {
        String status = statusOverride != null
            ? statusOverride
            : decision == TelegramNotifyService.OrderDecision.APPROVED
                ? "✅ <b>ОДОБРЕНО</b>"
                : "❌ <b>ОТКЛОНЕНО</b>";
        StringBuilder sb = new StringBuilder();
        sb.append(status).append("\n\n");
        sb.append("<b>🛒 Заказ</b>\n");
        sb.append("ID: <code>").append(BotMessageUtils.escapeHtml(order.uuid().toString())).append("</code>\n\n");
        sb.append("👤 ").append(BotMessageUtils.escapeHtml(order.getCustomerName())).append("\n");
        sb.append("📞 ").append(BotMessageUtils.escapeHtml(order.getPhone())).append("\n");
        sb.append("📦 ").append(BotMessageUtils.escapeHtml(order.getAddress())).append("\n");
        if (order.getComment() != null && !order.getComment().isBlank()) {
            sb.append("💬 ").append(BotMessageUtils.escapeHtml(order.getComment())).append("\n");
        }
        sb.append("\n<b>🧾 Состав:</b>\n");
        order.getItems().forEach(i -> {
            long lineTotal = i.getPriceMinorSnapshot() * (long) i.getQuantity();
            sb.append("• ")
                .append(BotMessageUtils.escapeHtml(i.getTitleSnapshot()))
                .append(i.getVariantNameSnapshot() != null && !i.getVariantNameSnapshot().isBlank()
                    ? " (" + BotMessageUtils.escapeHtml(i.getVariantNameSnapshot()) + ")"
                    : "")
                .append(" × ")
                .append(i.getQuantity())
                .append(" — ")
                .append(lineTotal)
                .append(" ")
                .append(BotMessageUtils.escapeHtml(order.getCurrency()))
                .append("\n");
        });
        sb.append("\n<b>💰 Итого:</b> ")
            .append(order.getTotalMinor())
            .append(" ")
            .append(BotMessageUtils.escapeHtml(order.getCurrency()))
            .append("\n");
        if (order.getDiscountMinor() > 0) {
            sb.append("Скидка: -")
                .append(order.getDiscountMinor())
                .append(" ")
                .append(BotMessageUtils.escapeHtml(order.getCurrency()))
                .append("\n");
        }
        if (order.getPromoCode() != null && !order.getPromoCode().isBlank()) {
            sb.append("Промокод: ").append(BotMessageUtils.escapeHtml(order.getPromoCode())).append("\n");
        }
        if (order.getTrackingNumber() != null && !order.getTrackingNumber().isBlank()) {
            sb.append("\n📦 ТТН: ").append(BotMessageUtils.escapeHtml(order.getTrackingNumber())).append("\n");
        }
        if (rejectReason != null && !rejectReason.isBlank()) {
            sb.append("\n❌ Причина: ").append(BotMessageUtils.escapeHtml(rejectReason)).append("\n");
        }

        sb.append("\n👤 TG: ").append(BotMessageUtils.buildUserReference(order.getTgUserId(), order.getTgUsername()));
        sb.append("\n");

        return sb.toString();
    }

    private void sendTrackingNumberRequest(
        org.telegram.telegrambots.meta.api.objects.CallbackQuery cb,
        UUID uuid,
        TelegramBotGateway gateway
    ) {
        ForceReplyKeyboard forceReply = ForceReplyKeyboard.builder()
            .forceReply(true)
            .selective(true)
            .build();

        SendMessage prompt = SendMessage.builder()
            .chatId(String.valueOf(cb.getMessage().getChatId()))
            .parseMode(ParseMode.HTML)
            .text("Введите ТТН для заказа <code>" + BotMessageUtils.escapeHtml(uuid.toString()) + "</code>")
            .replyMarkup(forceReply)
            .build();

        Message promptMessage = gateway.safeExecuteMessage(prompt);
        if (promptMessage != null) {
            state.pendingShipments().put(promptMessage.getMessageId(), new PendingShipment(
                uuid,
                cb.getMessage().getChatId(),
                cb.getMessage().getMessageId()
            ));
        }

        gateway.safeExecute(AnswerCallbackQuery.builder()
            .callbackQueryId(cb.getId())
            .text("Введите ТТН")
            .build());
    }

    private void sendRejectReasonRequest(
        org.telegram.telegrambots.meta.api.objects.CallbackQuery cb,
        UUID uuid,
        TelegramBotGateway gateway
    ) {
        ForceReplyKeyboard forceReply = ForceReplyKeyboard.builder()
            .forceReply(true)
            .selective(true)
            .build();

        SendMessage prompt = SendMessage.builder()
            .chatId(String.valueOf(cb.getMessage().getChatId()))
            .parseMode(ParseMode.HTML)
            .text("Напишите причину отклонения для заказа <code>" + BotMessageUtils.escapeHtml(uuid.toString()) + "</code>")
            .replyMarkup(forceReply)
            .build();

        Message promptMessage = gateway.safeExecuteMessage(prompt);
        if (promptMessage != null) {
            state.pendingRejections().put(promptMessage.getMessageId(), new PendingRejection(
                uuid,
                cb.getMessage().getChatId(),
                cb.getMessage().getMessageId()
            ));
        }

        gateway.safeExecute(AnswerCallbackQuery.builder()
            .callbackQueryId(cb.getId())
            .text("Укажите причину")
            .build());
    }

    private InlineKeyboardButton buildRejectButton(UUID uuid) {
        return InlineKeyboardButton.builder()
            .text("❌ Отклонить")
            .callbackData(TelegramNotifyService.CB_REJECT_PREFIX + uuid.toString())
            .build();
    }

    private InlineKeyboardMarkup buildAdminOrderKeyboard(List<InlineKeyboardButton> actionButtons, OrderEntity order) {
        InlineKeyboardButton invoiceButton = buildInvoiceButton(order);
        InlineKeyboardButton chatButton = buildOrderChatButton(order);
        List<List<InlineKeyboardButton>> rows = new java.util.ArrayList<>();
        if (!actionButtons.isEmpty()) {
            rows.add(actionButtons);
        }
        if (invoiceButton != null) {
            rows.add(List.of(invoiceButton));
        }
        if (chatButton != null) {
            rows.add(List.of(chatButton));
        }
        if (rows.isEmpty()) {
            return null;
        }
        return InlineKeyboardMarkup.builder().keyboard(rows).build();
    }

    private InlineKeyboardButton buildInvoiceButton(OrderEntity order) {
        if (!"APPROVED".equalsIgnoreCase(order.getStatus())) {
            return null;
        }
        return InlineKeyboardButton.builder()
            .text("💳 Отправить счёт")
            .callbackData(TelegramNotifyService.CB_INVOICE_PREFIX + order.uuid().toString())
            .build();
    }

    private InlineKeyboardButton buildOrderChatButton(OrderEntity order) {
        if (order.getAdminChatId() == null || order.getAdminThreadId() == null) {
            return null;
        }
        String link = BotMessageUtils.buildTopicLink(order.getAdminChatId(), order.getAdminThreadId());
        if (link == null) {
            return null;
        }
        return InlineKeyboardButton.builder()
            .text("💬 В чат заказа")
            .url(link)
            .build();
    }

    private boolean isAdmin(long userId) {
        Set<Long> admins = props.getTelegram().adminUserIdSet();
        return admins.contains(userId);
    }
}
