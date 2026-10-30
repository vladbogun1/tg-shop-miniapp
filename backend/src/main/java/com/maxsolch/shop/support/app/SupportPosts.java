package com.maxsolch.shop.support.app;

import static com.maxsolch.shop.platform.util.Texts.ellipsize;

import com.maxsolch.shop.customer.app.Customers;
import com.maxsolch.shop.order.app.SendMessageRequest;
import com.maxsolch.shop.order.domain.MessageType;
import com.maxsolch.shop.order.domain.SenderType;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.platform.web.TopicMessagePosted;
import com.maxsolch.shop.support.app.SupportDtos.MessageDto;
import com.maxsolch.shop.support.domain.SupportError;
import com.maxsolch.shop.support.domain.SupportEvents;
import com.maxsolch.shop.support.domain.SupportMessage;
import com.maxsolch.shop.support.domain.SupportStatus;
import com.maxsolch.shop.support.domain.SupportThread;
import com.maxsolch.shop.support.infra.SupportMessageRepository;
import com.maxsolch.shop.support.infra.SupportThreadRepository;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Locale;

/**
 * A message posted into a support thread: the row, the thread's counters and preview (a closed thread
 * reopens), then the live topic and {@link SupportEvents.MessagePosted} after the commit. Runs in the
 * caller's transaction ({@link SupportService}), the thread row already locked.
 */
@Component
class SupportPosts {

    private static final int PREVIEW_MAX = 200;

    private final SupportThreadRepository threads;
    private final SupportMessageRepository messageRepository;
    private final Customers userRepository;
    private final SupportMapper mapper;
    private final DomainEvents events;

    SupportPosts(SupportThreadRepository threads, SupportMessageRepository messageRepository, Customers userRepository,
                 SupportMapper mapper, DomainEvents events) {
        this.threads = threads;
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
        this.mapper = mapper;
        this.events = events;
    }

    /** The customer's message: the shop has one more unread, the thread waits for an answer. */
    MessageDto postCustomer(SupportThread t, long userId, SendMessageRequest req, Instant now, boolean newThread) {
        String name = t.getCustomerName() != null ? t.getCustomerName() : customerName(userId);
        SupportMessage m = persist(t.getId(), SenderType.CUSTOMER, userId, name, req, now);
        if (t.getStatus() == SupportStatus.CLOSED) {
            reopen(t);
        }
        t.setLastMessageAt(now);
        t.setLastSender(SenderType.CUSTOMER);
        t.setLastPreview(ellipsize(SupportMapper.previewOf(m), PREVIEW_MAX));
        t.setAdminUnread(t.getAdminUnread() + 1);
        if (t.getAwaitingSince() == null) {
            t.setAwaitingSince(now);
        }
        threads.save(t);
        MessageDto dto = mapper.toDto(m);
        events.publish(new TopicMessagePosted("/topic/support/" + UuidUtil.toString(t.getId()), dto));
        events.publish(new SupportEvents.MessagePosted(t.getId(), false, newThread, SupportMapper.previewOf(m)));
        return dto;
    }

    /** The shop's reply: the customer has one more unread, the thread stops waiting. */
    MessageDto postAdmin(SupportThread t, Long adminId, String adminName, SendMessageRequest req, Instant now) {
        SupportMessage m = persist(t.getId(), SenderType.ADMIN, adminId, adminName, req, now);
        if (t.getStatus() == SupportStatus.CLOSED) {
            reopen(t);
        }
        t.setLastMessageAt(now);
        t.setLastSender(SenderType.ADMIN);
        t.setLastPreview(ellipsize(SupportMapper.previewOf(m), PREVIEW_MAX));
        t.setCustomerUnread(t.getCustomerUnread() + 1);
        t.setAdminUnread(0);
        t.setAwaitingSince(null);
        threads.save(t);
        MessageDto dto = mapper.toDto(m);
        events.publish(new TopicMessagePosted("/topic/support/" + UuidUtil.toString(t.getId()), dto));
        events.publish(new SupportEvents.MessagePosted(t.getId(), true, false, SupportMapper.previewOf(m)));
        return dto;
    }

    private SupportMessage persist(byte[] threadId, SenderType sender, Long senderId, String senderName,
                                   SendMessageRequest req, Instant now) {
        SupportMessage m = new SupportMessage();
        m.setThreadId(threadId);
        m.setSenderType(sender);
        m.setSenderId(senderId);
        m.setSenderName(senderName == null ? null : ellipsize(senderName, 255));
        boolean hasAttachment = req.attachmentUrl() != null && !req.attachmentUrl().isBlank();
        MessageType type = parseType(req.type());
        if (type == MessageType.TEXT && hasAttachment) {
            type = req.mimeType() != null && !req.mimeType().startsWith("image/") ? MessageType.FILE : MessageType.PHOTO;
        }
        m.setType(type);
        String text = req.text() == null ? null : req.text().strip();
        m.setText(text == null || text.isEmpty() ? null : ellipsize(text, 8192));
        m.setAttachmentUrl(hasAttachment ? req.attachmentUrl().trim() : null);
        m.setFileName(req.fileName() == null ? null : ellipsize(req.fileName(), 512));
        m.setMimeType(req.mimeType() == null ? null : ellipsize(req.mimeType(), 128));
        m.setReplyToMessageId(req.replyToMessageId());
        m.setCreatedAt(now);
        return messageRepository.saveAndFlush(m);
    }

    static void reopen(SupportThread t) {
        t.setStatus(SupportStatus.OPEN);
        t.setClosedAt(null);
        t.setClosedBy(null);
    }

    String customerName(long userId) {
        return userRepository.findById(userId).map(SupportMapper::displayName).orElse(null);
    }

    private MessageType parseType(String type) {
        if (type == null || type.isBlank()) {
            return MessageType.TEXT;
        }
        try {
            MessageType t = MessageType.valueOf(type.trim().toUpperCase(Locale.ROOT));
            // SYSTEM cards are the server's own; nobody posts them through the API.
            return t == MessageType.SYSTEM ? MessageType.TEXT : t;
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest(SupportError.UNKNOWN_MESSAGE_TYPE, type);
        }
    }
}
