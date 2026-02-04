package com.example.tgshop.tg;

import com.example.tgshop.order.OrderEntity;
import com.example.tgshop.order.OrderMessageEntity;
import com.example.tgshop.order.OrderMessageRepository;
import java.time.Instant;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.User;

@Service
@Slf4j
public class OrderMessageLogService {

  private final OrderMessageRepository repository;

  public OrderMessageLogService(OrderMessageRepository repository) {
    this.repository = repository;
  }

  public void recordAdminMessage(OrderEntity order, Message message) {
    recordMessage(order, message, "ADMIN");
  }

  public void recordUserMessage(OrderEntity order, Message message) {
    recordMessage(order, message, "USER");
  }

  public void recordSystemMessage(OrderEntity order, String text) {
    if (order == null) {
      return;
    }
    OrderMessageEntity entry = new OrderMessageEntity();
    entry.setOrder(order);
    entry.setDirection("SYSTEM");
    entry.setMessageType("TEXT");
    entry.setText(text);
    entry.setCreatedAt(Instant.now());
    repository.save(entry);
  }

  public void recordSystemHtml(OrderEntity order, String html) {
    if (order == null) {
      return;
    }
    OrderMessageEntity entry = new OrderMessageEntity();
    entry.setOrder(order);
    entry.setDirection("SYSTEM");
    entry.setMessageType("HTML");
    entry.setText(html);
    entry.setCreatedAt(Instant.now());
    repository.save(entry);
  }

  private void recordMessage(OrderEntity order, Message message, String direction) {
    if (order == null || message == null) {
      return;
    }
    Instant createdAt = message.getDate() != null ? Instant.ofEpochSecond(message.getDate()) : Instant.now();
    String senderName = null;
    Long senderId = null;
    User from = message.getFrom();
    if (from != null) {
      senderName = from.getFirstName();
      if (from.getLastName() != null && !from.getLastName().isBlank()) {
        senderName = senderName + " " + from.getLastName();
      }
      senderId = from.getId();
    }

    String messageType = "TEXT";
    String text = null;
    String fileId = null;
    String fileName = null;
    String mimeType = null;
    if (message.hasText()) {
      messageType = "TEXT";
      text = message.getText();
    } else if (message.hasPhoto()) {
      var photo = message.getPhoto().get(message.getPhoto().size() - 1);
      messageType = "PHOTO";
      fileId = photo.getFileId();
      text = message.getCaption();
    } else if (message.hasDocument()) {
      var doc = message.getDocument();
      messageType = "DOCUMENT";
      fileId = doc.getFileId();
      fileName = doc.getFileName();
      mimeType = doc.getMimeType();
      text = message.getCaption();
    } else if (message.hasVideo()) {
      var video = message.getVideo();
      messageType = "VIDEO";
      fileId = video.getFileId();
      fileName = video.getFileName();
      mimeType = video.getMimeType();
      text = message.getCaption();
    } else if (message.hasAudio()) {
      var audio = message.getAudio();
      messageType = "AUDIO";
      fileId = audio.getFileId();
      fileName = audio.getFileName();
      mimeType = audio.getMimeType();
      text = message.getCaption();
    } else if (message.hasVoice()) {
      var voice = message.getVoice();
      messageType = "VOICE";
      fileId = voice.getFileId();
      mimeType = voice.getMimeType();
    } else if (message.hasAnimation()) {
      var anim = message.getAnimation();
      messageType = "ANIMATION";
      fileId = anim.getFileId();
      fileName = anim.getFileName();
      mimeType = anim.getMimeType();
      text = message.getCaption();
    } else if (message.hasSticker()) {
      var sticker = message.getSticker();
      messageType = "STICKER";
      fileId = sticker.getFileId();
    } else if (message.hasLocation()) {
      var location = message.getLocation();
      messageType = "TEXT";
      text = "📍 " + location.getLatitude() + ", " + location.getLongitude();
    } else if (message.hasContact()) {
      var contact = message.getContact();
      messageType = "TEXT";
      text = "👤 " + contact.getFirstName() + " " + contact.getLastName()
          + " (" + contact.getPhoneNumber() + ")";
    } else {
      messageType = "TEXT";
      text = "⚠️ Неподдерживаемый тип сообщения.";
    }

    OrderMessageEntity entry = new OrderMessageEntity();
    entry.setOrder(order);
    entry.setDirection(direction);
    entry.setSenderName(senderName);
    entry.setSenderId(senderId);
    entry.setMessageType(messageType);
    entry.setText(text);
    entry.setFileId(fileId);
    entry.setFileName(fileName);
    entry.setMimeType(mimeType);
    entry.setTgMessageId(message.getMessageId());
    entry.setTgReplyToMessageId(message.getReplyToMessage() != null ? message.getReplyToMessage().getMessageId() : null);
    entry.setCreatedAt(createdAt);
    repository.save(entry);
    log.debug("🤖 TG Logged order message orderId={} direction={} type={}",
        order.uuid(), direction, entry.getMessageType());
  }
}
