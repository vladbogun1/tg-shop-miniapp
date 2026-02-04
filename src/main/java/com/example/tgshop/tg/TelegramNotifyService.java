package com.example.tgshop.tg;

import com.example.tgshop.config.AppProperties;
import com.example.tgshop.order.OrderEntity;
import com.example.tgshop.order.OrderRepository;
import com.example.tgshop.settings.PaymentTemplateDefaults;
import com.example.tgshop.settings.Setting;
import com.example.tgshop.settings.SettingRepository;
import java.util.List;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.telegram.telegrambots.meta.api.methods.ParseMode;
import org.telegram.telegrambots.meta.api.methods.forum.CloseForumTopic;
import org.telegram.telegrambots.meta.api.methods.forum.CreateForumTopic;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.DeleteMessage;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.forum.ForumTopic;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;

@Service
@Slf4j
public class TelegramNotifyService {

    public static final String CB_APPROVE_PREFIX = "order:approve:";
    public static final String CB_REJECT_PREFIX  = "order:reject:";
    public static final String CB_SHIP_PREFIX = "order:ship:";
    public static final String CB_INVOICE_PREFIX = "order:invoice:";
    public static final String CB_DELIVER_PREFIX = "order:deliver:";

    private static final String SETTING_BOARD_NEW = "ADMIN_ORDER_BOARD_NEW";
    private static final String SETTING_BOARD_PROCESSING = "ADMIN_ORDER_BOARD_PROCESSING";
    private static final String SETTING_BOARD_SHIPPED = "ADMIN_ORDER_BOARD_SHIPPED";
    private static final String SETTING_BOARD_CLOSED = "ADMIN_ORDER_BOARD_CLOSED";

    private final TelegramSender sender;
    private final AppProperties props;
    private final SettingRepository settingRepository;
    private final OrderRepository orderRepository;

    public TelegramNotifyService(
            TelegramSender sender,
            AppProperties props,
            SettingRepository settingRepository,
            OrderRepository orderRepository
    ) {
        this.sender = sender;
        this.props = props;
        this.settingRepository = settingRepository;
        this.orderRepository = orderRepository;
    }

    /** Админу: новый заказ + кнопки approve/reject */
    public void notifyNewOrder(OrderEntity order) {
        String chatId = getAdminChatId();
        if (chatId == null || chatId.isBlank()) {
            log.warn("🤖 TG Skipping admin notification: admin chat id not configured");
            return;
        }

        OrderChatInfo chatInfo = ensureOrderChat(order, chatId);
        String text = buildAdminOrderText(order);
        if (chatInfo == null || chatInfo.topicLink() == null) {
            text = text + "\n\n⚠️ <i>Чат заказа не создан. Включите темы (Forum) в админ-чате, чтобы работать в отдельных чатах заказов.</i>";
        }

        var approveBtn = InlineKeyboardButton.builder()
                .text("✅ Одобрить")
                .callbackData(CB_APPROVE_PREFIX + order.uuid().toString())
                .build();

        var rejectBtn = InlineKeyboardButton.builder()
                .text("❌ Отклонить")
                .callbackData(CB_REJECT_PREFIX + order.uuid().toString())
                .build();

        InlineKeyboardMarkup kb;
        if (chatInfo != null && chatInfo.topicLink() != null) {
            var chatBtn = InlineKeyboardButton.builder()
                .text("💬 В чат заказа")
                .url(chatInfo.topicLink())
                .build();
            kb = InlineKeyboardMarkup.builder()
                .keyboard(List.of(List.of(approveBtn, rejectBtn), List.of(chatBtn)))
                .build();
        } else {
            kb = InlineKeyboardMarkup.builder()
                .keyboard(List.of(List.of(approveBtn, rejectBtn)))
                .build();
        }

        SendMessage msg = SendMessage.builder()
                .chatId(chatId)
                .parseMode(ParseMode.HTML)
                .text(text)
                .replyMarkup(kb)
                .build();

        log.info("🤖 TG Sending admin notification for order uuid={} chatId={}", order.uuid(), chatId);
        sender.safeExecute(msg);
    }

    /** Пользователю: сразу после оформления */
    public void notifyUserOrderPlaced(OrderEntity order) {
        if (order.getTgUserId() <= 0) {
            log.warn("🤖 TG Skipping user notification: missing tg user id for order uuid={}", order.uuid());
            return;
        }

        StringBuilder sb = new StringBuilder();
        sb.append("✅ <b>Заказ принят</b>\n");
        sb.append("ID: <code>").append(escapeHtml(order.uuid().toString())).append("</code>\n");
        sb.append("💰 Итого: ")
                .append(order.getTotalMinor()).append(" ").append(escapeHtml(order.getCurrency()))
                .append("\n\n");
        sb.append("Мы свяжемся с вами после проверки заказа администратором.");

        SendMessage msg = SendMessage.builder()
                .chatId(String.valueOf(order.getTgUserId()))
                .parseMode(ParseMode.HTML)
                .text(sb.toString())
                .build();

        log.info("🤖 TG Sending user order placed notification uuid={} tgUserId={}", order.uuid(), order.getTgUserId());
        sender.safeExecute(msg);
    }

    /** Пользователю: когда админ одобрил/отклонил */
    public void notifyUserOrderStatus(OrderEntity order, OrderDecision decision) {
        if (order.getTgUserId() <= 0) {
            log.warn("🤖 TG Skipping user status notification: missing tg user id for order uuid={}", order.uuid());
            return;
        }

        String text;
        if (decision == OrderDecision.APPROVED) {
            StringBuilder sb = new StringBuilder();
            sb.append("✅ <b>Ваш заказ одобрен</b>\n");
            sb.append("ID: <code>").append(escapeHtml(order.uuid().toString())).append("</code>\n");
            sb.append(buildItemsBlock(order));
            sb.append("\nСпасибо! Мы скоро свяжемся с вами.");
            text = sb.toString();
        } else {
            text = "❌ <b>Ваш заказ отклонён</b>\n" +
                "ID: <code>" + escapeHtml(order.uuid().toString()) + "</code>\n" +
                "Если хотите — оформите заказ повторно или уточните детали у администратора.";
        }

        SendMessage msg = SendMessage.builder()
                .chatId(String.valueOf(order.getTgUserId()))
                .parseMode(ParseMode.HTML)
                .text(text)
                .build();

        log.info("🤖 TG Sending user order status notification uuid={} decision={} tgUserId={}",
                order.uuid(), decision, order.getTgUserId());
        sender.safeExecute(msg);
    }

    /** Пользователю: когда админ отклонил с причиной */
    public void notifyUserOrderRejected(OrderEntity order, String reason) {
        if (order.getTgUserId() <= 0) {
            log.warn("🤖 TG Skipping user rejected notification: missing tg user id for order uuid={}", order.uuid());
            return;
        }

        StringBuilder sb = new StringBuilder();
        sb.append("❌ <b>Ваш заказ отклонён</b>\n");
        sb.append("ID: <code>").append(escapeHtml(order.uuid().toString())).append("</code>\n");
        if (reason != null && !reason.isBlank()) {
            sb.append("Причина: ").append(escapeHtml(reason)).append("\n");
        }
        sb.append("Если хотите — оформите заказ повторно или уточните детали у администратора.");

        SendMessage msg = SendMessage.builder()
            .chatId(String.valueOf(order.getTgUserId()))
            .parseMode(ParseMode.HTML)
            .text(sb.toString())
            .build();

        log.info("🤖 TG Sending user rejected notification uuid={} tgUserId={}", order.uuid(), order.getTgUserId());
        sender.safeExecute(msg);
    }
    /** Пользователю: когда заказ отправлен */
    public void notifyUserOrderShipped(OrderEntity order) {
        if (order.getTgUserId() <= 0) {
            log.warn("🤖 TG Skipping user shipped notification: missing tg user id for order uuid={}", order.uuid());
            return;
        }

        StringBuilder sb = new StringBuilder();
        sb.append("📦 <b>Ваш заказ отправлен</b>\n");
        sb.append("ID: <code>").append(escapeHtml(order.uuid().toString())).append("</code>\n");
        if (order.getTrackingNumber() != null && !order.getTrackingNumber().isBlank()) {
            sb.append("ТТН: ").append(escapeHtml(order.getTrackingNumber())).append("\n");
        }
        sb.append(buildItemsBlock(order));
        sb.append("\nСпасибо за заказ!");

        SendMessage msg = SendMessage.builder()
                .chatId(String.valueOf(order.getTgUserId()))
                .parseMode(ParseMode.HTML)
                .text(sb.toString())
                .build();

        log.info("🤖 TG Sending user order shipped notification uuid={} tgUserId={}",
                order.uuid(), order.getTgUserId());
        sender.safeExecute(msg);
    }

    public Message notifyUserPaymentRequest(OrderEntity order) {
        if (order.getTgUserId() <= 0) {
            log.warn("🤖 TG Skipping user payment request: missing tg user id for order uuid={}", order.uuid());
            return null;
        }

        String html = settingRepository.findById(PaymentTemplateDefaults.PAYMENT_TEMPLATE_KEY)
            .map(Setting::getValue)
            .orElseGet(PaymentTemplateDefaults::defaultTemplate);

        var replyMarkup = org.telegram.telegrambots.meta.api.objects.replykeyboard.ForceReplyKeyboard.builder()
            .forceReply(true)
            .selective(true)
            .build();

        SendMessage msg = SendMessage.builder()
            .chatId(String.valueOf(order.getTgUserId()))
            .parseMode(ParseMode.HTML)
            .text(html)
            .replyMarkup(replyMarkup)
            .build();

        log.info("🤖 TG Sending user payment request uuid={} tgUserId={}", order.uuid(), order.getTgUserId());
        return sender.safeExecuteMessage(msg);
    }

    private String buildAdminOrderText(OrderEntity order) {
        StringBuilder sb = new StringBuilder();
        sb.append("<b>🛒 Новый заказ</b>\n");
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

        sb.append("\n👤 TG: ").append(buildUserReference(order.getTgUserId(), order.getTgUsername()));
        sb.append("\n");

        return sb.toString();
    }

    private OrderChatInfo ensureOrderChat(OrderEntity order, String adminChatId) {
        if (order.getAdminThreadId() != null && order.getAdminChatId() != null) {
            String link = buildTopicLink(order.getAdminChatId(), order.getAdminThreadId());
            return new OrderChatInfo(order.getAdminThreadId(), link);
        }

        Long chatId = parseChatId(adminChatId);
        if (chatId == null) {
            log.warn("🤖 TG Unable to parse admin chat id {}", adminChatId);
            return null;
        }

        String topicName = buildOrderTopicName(order);
        try {
            ForumTopic topic = sender.safeExecute(CreateForumTopic.builder()
                .chatId(adminChatId)
                .name(topicName)
                .build());
            if (topic == null) {
                return null;
            }

            Integer threadId = topic.getMessageThreadId();
            if (threadId == null) {
                return null;
            }

            SendMessage threadMessage = SendMessage.builder()
                .chatId(adminChatId)
                .messageThreadId(threadId)
                .parseMode(ParseMode.HTML)
                .text(buildAdminOrderText(order))
                .build();
            Message sent = sender.safeExecuteMessage(threadMessage);
            order.setAdminChatId(chatId);
            order.setAdminThreadId(threadId);
            if (sent != null) {
                order.setAdminThreadMessageId(sent.getMessageId());
            }
            orderRepository.save(order);

            String link = buildTopicLink(chatId, threadId);
            return new OrderChatInfo(threadId, link);
        } catch (Exception e) {
            log.warn("🤖 TG Failed to create order chat topic for order uuid={}", order.uuid(), e);
            return null;
        }
    }

    private static Long parseChatId(String chatId) {
        try {
            return Long.parseLong(chatId);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String buildOrderTopicName(OrderEntity order) {
        String shortId = order.uuid().toString().substring(0, 8);
        String statusIcon = resolveStatusIcon(order.getStatus());
        return statusIcon + " Заказ " + shortId + " — " + order.getCustomerName();
    }

    public void updateOrderTopicStatus(OrderEntity order) {
        if (order.getAdminChatId() == null || order.getAdminThreadId() == null) {
            return;
        }
        String topicName = buildOrderTopicName(order);
        SafeEditForumTopic editTopic = new SafeEditForumTopic();
        editTopic.setChatId(String.valueOf(order.getAdminChatId()));
        editTopic.setMessageThreadId(order.getAdminThreadId());
        editTopic.setName(topicName);
        sender.safeExecute(editTopic);
    }

    public void updateOrderBoardForStatus(OrderEntity order) {
        if (order == null || order.getStatus() == null) {
            return;
        }
        String status = order.getStatus().trim().toUpperCase();
        BoardStage stage = switch (status) {
            case "NEW" -> BoardStage.NEW;
            case "APPROVED" -> BoardStage.PROCESSING;
            case "SHIPPED" -> BoardStage.SHIPPED;
            case "DELIVERED", "REJECTED" -> BoardStage.CLOSED;
            default -> null;
        };
        if (stage == null) {
            return;
        }
        moveOrderToBoard(order, stage);
    }

    public void archiveOrderChat(OrderEntity order) {
        if (order == null || order.getAdminChatId() == null || order.getAdminThreadId() == null) {
            return;
        }
        CloseForumTopic closeTopic = CloseForumTopic.builder()
            .chatId(String.valueOf(order.getAdminChatId()))
            .messageThreadId(order.getAdminThreadId())
            .build();
        sender.safeExecute(closeTopic);
    }

    private static String resolveStatusIcon(String status) {
        if (status == null) {
            return "🆕";
        }
        String normalized = status.trim().toUpperCase();
        return switch (normalized) {
            case "APPROVED", "APPROVE", "ACCEPTED" -> "✅";
            case "SHIPPED" -> "📦";
            case "DELIVERED" -> "✅";
            case "REJECTED", "DECLINED", "CANCELLED", "CANCELED" -> "❌";
            default -> "🆕";
        };
    }

    private static String buildTopicLink(long chatId, int threadId) {
        String abs = String.valueOf(Math.abs(chatId));
        String chatPart = abs.startsWith("100") ? abs.substring(3) : abs;
        return "https://t.me/c/" + chatPart + "/" + threadId;
    }

    private String buildItemsBlock(OrderEntity order) {
        StringBuilder sb = new StringBuilder();
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
        return sb.toString();
    }

    private String getAdminChatId() {
        Optional<Setting> s = settingRepository.findById("ADMIN_CHAT_ID");
        if (s.isPresent()) {
            return s.get().getValue();
        }
        return props.getTelegram().getDefaultAdminChatId();
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

    public enum OrderDecision { APPROVED, REJECTED }

    private void moveOrderToBoard(OrderEntity order, BoardStage stage) {
        BoardTarget target = loadBoardTarget(stage.settingKey());
        if (target == null) {
            return;
        }
        clearBoardMessage(order);
        SendMessage msg = SendMessage.builder()
            .chatId(String.valueOf(target.chatId()))
            .messageThreadId(target.threadId())
            .parseMode(ParseMode.HTML)
            .text(buildBoardMessage(order, stage))
            .replyMarkup(buildBoardChatLink(order))
            .build();
        Message sent = sender.safeExecuteMessage(msg);
        if (sent != null) {
            order.setAdminBoardChatId(target.chatId());
            order.setAdminBoardThreadId(target.threadId());
            order.setAdminBoardMessageId(sent.getMessageId());
            orderRepository.save(order);
        }
    }

    private void clearBoardMessage(OrderEntity order) {
        if (order.getAdminBoardChatId() == null || order.getAdminBoardMessageId() == null) {
            return;
        }
        sender.safeExecute(DeleteMessage.builder()
            .chatId(String.valueOf(order.getAdminBoardChatId()))
            .messageId(order.getAdminBoardMessageId())
            .build());
        order.setAdminBoardChatId(null);
        order.setAdminBoardThreadId(null);
        order.setAdminBoardMessageId(null);
        orderRepository.save(order);
    }

    private BoardTarget loadBoardTarget(String settingKey) {
        return settingRepository.findById(settingKey)
            .map(Setting::getValue)
            .map(this::parseBoardTarget)
            .orElse(null);
    }

    private BoardTarget parseBoardTarget(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String[] parts = value.split(":");
        if (parts.length != 2) {
            return null;
        }
        try {
            long chatId = Long.parseLong(parts[0]);
            int threadId = Integer.parseInt(parts[1]);
            return new BoardTarget(chatId, threadId);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String buildBoardMessage(OrderEntity order, BoardStage stage) {
        StringBuilder sb = new StringBuilder();
        sb.append(stage.header()).append("\n");
        sb.append("ID: <code>").append(escapeHtml(order.uuid().toString())).append("</code>\n");
        sb.append("👤 ").append(escapeHtml(order.getCustomerName())).append("\n");
        sb.append("📞 ").append(escapeHtml(order.getPhone())).append("\n");
        sb.append("💰 Итого: ").append(order.getTotalMinor())
            .append(" ").append(escapeHtml(order.getCurrency())).append("\n");
        return sb.toString();
    }

    private InlineKeyboardMarkup buildBoardChatLink(OrderEntity order) {
        if (order.getAdminChatId() == null || order.getAdminThreadId() == null) {
            return null;
        }
        String link = buildTopicLink(order.getAdminChatId(), order.getAdminThreadId());
        if (link == null) {
            return null;
        }
        InlineKeyboardButton chatBtn = InlineKeyboardButton.builder()
            .text("💬 В чат заказа")
            .url(link)
            .build();
        return InlineKeyboardMarkup.builder()
            .keyboard(List.of(List.of(chatBtn)))
            .build();
    }

    private static String escapeHtml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private record OrderChatInfo(Integer threadId, String topicLink) {}

    private record BoardTarget(long chatId, int threadId) {}

    private enum BoardStage {
        NEW(SETTING_BOARD_NEW, "🆕 <b>Новый заказ</b>"),
        PROCESSING(SETTING_BOARD_PROCESSING, "🛠 <b>В обработке</b>"),
        SHIPPED(SETTING_BOARD_SHIPPED, "📦 <b>Выслан</b>"),
        CLOSED(SETTING_BOARD_CLOSED, "✅ <b>Завершён</b>");

        private final String settingKey;
        private final String header;

        BoardStage(String settingKey, String header) {
            this.settingKey = settingKey;
            this.header = header;
        }

        public String settingKey() {
            return settingKey;
        }

        public String header() {
            return header;
        }
    }
}
