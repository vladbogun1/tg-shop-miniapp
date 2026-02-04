package com.example.tgshop.order;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "order_messages")
public class OrderMessageEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "order_id", nullable = false)
  private OrderEntity order;

  @Column(name = "direction", length = 32, nullable = false)
  private String direction;

  @Column(name = "sender_name", length = 255)
  private String senderName;

  @Column(name = "sender_id")
  private Long senderId;

  @Column(name = "message_type", length = 32, nullable = false)
  private String messageType;

  @Column(name = "text", length = 8192)
  private String text;

  @Column(name = "file_id", length = 512)
  private String fileId;

  @Column(name = "file_name", length = 512)
  private String fileName;

  @Column(name = "mime_type", length = 128)
  private String mimeType;

  @Column(name = "tg_message_id")
  private Integer tgMessageId;

  @Column(name = "tg_reply_to_message_id")
  private Integer tgReplyToMessageId;

  @Column(name = "tg_thread_id")
  private Integer tgThreadId;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @PrePersist
  void prePersist() {
    if (createdAt == null) {
      createdAt = Instant.now();
    }
  }
}
