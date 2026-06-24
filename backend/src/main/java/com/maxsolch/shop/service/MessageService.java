package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.MessageType;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderMessage;
import com.maxsolch.shop.domain.SenderType;
import com.maxsolch.shop.repository.OrderMessageRepository;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.tg.NotificationService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.ConversationDto;
import com.maxsolch.shop.web.dto.MessageDto;
import com.maxsolch.shop.web.dto.SendMessageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Order-chat persistence + realtime broadcast. Customer messages do NOT ping the bot;
 * admin messages persist + broadcast + DM the customer (NotificationService.onAdminChatMessage).
 */
@Service
public class MessageService {

    private final OrderMessageRepository messageRepository;
    private final OrderRepository orderRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final NotificationService notificationService;

    public MessageService(OrderMessageRepository messageRepository,
                          OrderRepository orderRepository,
                          SimpMessagingTemplate messagingTemplate,
                          NotificationService notificationService) {
        this.messageRepository = messageRepository;
        this.orderRepository = orderRepository;
        this.messagingTemplate = messagingTemplate;
        this.notificationService = notificationService;
    }

    @Transactional(readOnly = true)
    public List<MessageDto> list(byte[] orderId) {
        return messageRepository.findByOrderIdOrderByCreatedAtAsc(orderId).stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional
    public MessageDto postCustomerMessage(byte[] orderId, Long senderId, String senderName,
                                          SendMessageRequest req) {
        Order order = order(orderId);
        OrderMessage saved = persist(order, SenderType.CUSTOMER, senderId, senderName, req);
        MessageDto dto = toDto(saved);
        broadcast(orderId, dto);
        // notify admins (chat-messages topic); customer is the sender → no DM to them
        notificationService.onCustomerChatMessage(order, previewOf(saved));
        return dto;
    }

    @Transactional
    public MessageDto postAdminMessage(byte[] orderId, Long senderId, String senderName,
                                       SendMessageRequest req) {
        Order order = order(orderId);
        OrderMessage saved = persist(order, SenderType.ADMIN, senderId, senderName, req);
        MessageDto dto = toDto(saved);
        broadcast(orderId, dto);
        notificationService.onAdminChatMessage(order, previewOf(saved));
        return dto;
    }

    /** Short preview of a message for notifications. */
    private String previewOf(OrderMessage m) {
        if (m.getText() != null && !m.getText().isBlank()) {
            return m.getText();
        }
        return switch (m.getType()) {
            case PHOTO -> "📷 Фото";
            case FILE -> "📎 Файл";
            default -> "";
        };
    }

    /** Mark messages from the opposite side as read. */
    @Transactional
    public void markRead(byte[] orderId, SenderType readSenderType) {
        // readSenderType = the side whose messages are now considered read by the viewer.
        messageRepository.markRead(orderId, readSenderType, Instant.now());
    }

    @Transactional(readOnly = true)
    public long unreadForCustomer(byte[] orderId) {
        // unread = ADMIN messages not yet read by the customer
        return messageRepository.countByOrderIdAndSenderTypeAndReadAtIsNull(orderId, SenderType.ADMIN);
    }

    @Transactional(readOnly = true)
    public long unreadForAdmin(byte[] orderId) {
        // unread = CUSTOMER messages not yet read by the admin
        return messageRepository.countByOrderIdAndSenderTypeAndReadAtIsNull(orderId, SenderType.CUSTOMER);
    }

    /** Total unread ADMIN messages across a customer's orders (customer bell). */
    @Transactional(readOnly = true)
    public long totalUnreadForCustomer(long userId) {
        return messageRepository.countUnreadForUser(userId, SenderType.ADMIN);
    }

    /** Total unread CUSTOMER messages across all orders (admin bell). */
    @Transactional(readOnly = true)
    public long totalUnreadForAdmin() {
        return messageRepository.countUnreadBySenderType(SenderType.CUSTOMER);
    }

    // ----- conversations inbox (notifications modal) -----

    /** Orders with unread CUSTOMER messages, newest activity first (admin inbox). */
    @Transactional(readOnly = true)
    public List<ConversationDto> adminConversations() {
        return messageRepository.orderIdsWithUnread(SenderType.CUSTOMER).stream()
                .map(id -> buildConversation(id, SenderType.CUSTOMER))
                .filter(java.util.Objects::nonNull)
                .sorted(java.util.Comparator.comparing(ConversationDto::lastAt,
                        java.util.Comparator.nullsLast(java.util.Comparator.naturalOrder())).reversed())
                .limit(100)
                .toList();
    }

    /** A customer's orders with unread ADMIN messages, newest first (customer inbox). */
    @Transactional(readOnly = true)
    public List<ConversationDto> customerConversations(long userId) {
        return messageRepository.orderIdsWithUnreadForUser(userId, SenderType.ADMIN).stream()
                .map(id -> buildConversation(id, SenderType.ADMIN))
                .filter(java.util.Objects::nonNull)
                .sorted(java.util.Comparator.comparing(ConversationDto::lastAt,
                        java.util.Comparator.nullsLast(java.util.Comparator.naturalOrder())).reversed())
                .limit(100)
                .toList();
    }

    private ConversationDto buildConversation(byte[] orderId, SenderType unreadSender) {
        Order o = orderRepository.findById(orderId).orElse(null);
        if (o == null) {
            return null;
        }
        OrderMessage last = messageRepository.findFirstByOrderIdOrderByCreatedAtDescIdDesc(orderId);
        long unread = messageRepository.countByOrderIdAndSenderTypeAndReadAtIsNull(orderId, unreadSender);
        String shortId = UuidUtil.toString(orderId);
        if (shortId != null && shortId.length() >= 8) {
            shortId = shortId.substring(0, 8);
        }
        return new ConversationDto(
                UuidUtil.toString(orderId),
                shortId,
                o.getCustomerName(),
                o.getStatus() == null ? null : o.getStatus().name(),
                last == null ? "" : stripHtml(previewOf(last)),
                last == null ? null : last.getSenderType().name(),
                last == null ? o.getCreatedAt() : last.getCreatedAt(),
                unread);
    }

    /** Mark ALL unread customer messages read (admin "read all"). Returns count marked. */
    @Transactional
    public int markAllReadForAdmin() {
        return messageRepository.markAllRead(SenderType.CUSTOMER, Instant.now());
    }

    /** Strip HTML tags + collapse whitespace for short text previews (SYSTEM cards carry HTML). */
    private static String stripHtml(String s) {
        if (s == null || s.isBlank()) {
            return "";
        }
        return s.replaceAll("<[^>]+>", "").replace("&amp;", "&").replace("&lt;", "<")
                .replace("&gt;", ">").replaceAll("\\s+", " ").trim();
    }

    private OrderMessage persist(Order order, SenderType senderType, Long senderId, String senderName,
                                 SendMessageRequest req) {
        MessageType type = parseType(req.type());
        if ((req.text() == null || req.text().isBlank())
                && (req.attachmentUrl() == null || req.attachmentUrl().isBlank())) {
            throw new BadRequestException("message requires text or attachment");
        }
        OrderMessage m = new OrderMessage();
        m.setOrder(order);
        m.setSenderType(senderType);
        m.setSenderId(senderId);
        m.setSenderName(senderName);
        m.setType(type);
        m.setText(req.text());
        m.setAttachmentUrl(req.attachmentUrl());
        m.setFileName(req.fileName());
        m.setMimeType(req.mimeType());
        m.setReplyToMessageId(req.replyToMessageId());
        return messageRepository.saveAndFlush(m);
    }

    private void broadcast(byte[] orderId, MessageDto dto) {
        messagingTemplate.convertAndSend("/topic/orders/" + UuidUtil.toString(orderId) + "/chat", dto);
    }

    private MessageType parseType(String type) {
        if (type == null || type.isBlank()) {
            return MessageType.TEXT;
        }
        try {
            return MessageType.valueOf(type.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("unknown message type: " + type);
        }
    }

    private Order order(byte[] orderId) {
        return orderRepository.findById(orderId)
                .orElseThrow(() -> new NotFoundException("order not found"));
    }

    private MessageDto toDto(OrderMessage m) {
        return new MessageDto(
                m.getId(),
                UuidUtil.toString(m.getOrder().getId()),
                m.getSenderType().name(),
                m.getSenderName(),
                m.getType().name(),
                m.getText(),
                m.getAttachmentUrl(),
                m.getFileName(),
                m.getMimeType(),
                m.getReplyToMessageId(),
                m.getCreatedAt(),
                m.getReadAt());
    }
}
