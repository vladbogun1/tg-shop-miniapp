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
    OrderMessageEntity entry = new OrderMessageEntity();
    entry.setOrder(order);
    entry.setDirection(direction);
    entry.setTgMessageId(message.getMessageId());
    entry.setTgReplyToMessageId(message.getReplyToMessage() != null ? message.getReplyToMessage().getMessageId() : null);
    entry.setTgThreadId(message.getMessageThreadId());
    entry.setCreatedAt(message.getDate() != null ? Instant.ofEpochSecond(message.getDate()) : Instant.now());

    User from = message.getFrom();
    if (from != null) {
      String name = from.getFirstName();
      if (from.getLastName() != null && !from.getLastName().isBlank()) {
        name = name + " " + from.getLastName();
      }
      entry.setSenderName(name);
      entry.setSenderId(from.getId());
    }

    if (message.hasText()) {
      entry.setMessageType("TEXT");
      entry.setText(message.getText());
    } else if (message.hasPhoto()) {
      var photo = message.getPhoto().get(message.getPhoto().size() - 1);
      entry.setMessageType("PHOTO");
      entry.setFileId(photo.getFileId());
      entry.setText(message.getCaption());
    } else if (message.hasDocument()) {
      var doc = message.getDocument();
      entry.setMessageType("DOCUMENT");
      entry.setFileId(doc.getFileId());
      entry.setFileName(doc.getFileName());
      entry.setMimeType(doc.getMimeType());
      entry.setText(message.getCaption());
    } else if (message.hasVideo()) {
      var video = message.getVideo();
      entry.setMessageType("VIDEO");
      entry.setFileId(video.getFileId());
      entry.setFileName(video.getFileName());
      entry.setMimeType(video.getMimeType());
      entry.setText(message.getCaption());
    } else if (message.hasAudio()) {
      var audio = message.getAudio();
      entry.setMessageType("AUDIO");
      entry.setFileId(audio.getFileId());
      entry.setFileName(audio.getFileName());
      entry.setMimeType(audio.getMimeType());
      entry.setText(message.getCaption());
    } else if (message.hasVoice()) {
      var voice = message.getVoice();
      entry.setMessageType("VOICE");
      entry.setFileId(voice.getFileId());
      entry.setMimeType(voice.getMimeType());
    } else if (message.hasAnimation()) {
      var anim = message.getAnimation();
      entry.setMessageType("ANIMATION");
      entry.setFileId(anim.getFileId());
      entry.setFileName(anim.getFileName());
      entry.setMimeType(anim.getMimeType());
      entry.setText(message.getCaption());
    } else if (message.hasSticker()) {
      var sticker = message.getSticker();
      entry.setMessageType("STICKER");
      entry.setFileId(sticker.getFileId());
    } else if (message.hasLocation()) {
      var location = message.getLocation();
      entry.setMessageType("TEXT");
      entry.setText("📍 " + location.getLatitude() + ", " + location.getLongitude());
    } else if (message.hasContact()) {
      var contact = message.getContact();
      entry.setMessageType("TEXT");
      entry.setText("👤 " + contact.getFirstName() + " " + contact.getLastName()
          + " (" + contact.getPhoneNumber() + ")");
    } else {
      entry.setMessageType("TEXT");
      entry.setText("⚠️ Неподдерживаемый тип сообщения.");
    }

    repository.save(entry);
    log.debug("🤖 TG Logged order message orderId={} direction={} type={}",
        order.uuid(), direction, entry.getMessageType());
  }
}
