package com.maxsolch.shop.support;

import com.maxsolch.shop.domain.MessageType;
import com.maxsolch.shop.domain.SenderType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/** One message of a {@link SupportThread}; same shape as an order-chat message. */
@Getter
@Setter
@Entity
@Table(name = "support_messages")
public class SupportMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "thread_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] threadId;

    @Enumerated(EnumType.STRING)
    @Column(name = "sender_type", nullable = false)
    private SenderType senderType;

    /** Customer: users.telegram_user_id; admin: admin id. The customer limits count by this. */
    @Column(name = "sender_id")
    private Long senderId;

    @Column(name = "sender_name", length = 255)
    private String senderName;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false)
    private MessageType type = MessageType.TEXT;

    @Column(name = "text", length = 8192)
    private String text;

    @Column(name = "attachment_url", length = 2048)
    private String attachmentUrl;

    @Column(name = "file_name", length = 512)
    private String fileName;

    @Column(name = "mime_type", length = 128)
    private String mimeType;

    @Column(name = "reply_to_message_id")
    private Long replyToMessageId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "read_at")
    private Instant readAt;
}
