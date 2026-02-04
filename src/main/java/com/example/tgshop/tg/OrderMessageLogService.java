package com.example.tgshop.tg;

import com.example.tgshop.order.OrderEntity;
import com.example.tgshop.tg.bot.BotState;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.User;

@Service
@Slf4j
public class OrderMessageLogService {

  private final BotState state;

  public OrderMessageLogService(BotState state) {
    this.state = state;
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
    BotState.OrderLogEntry entry = new BotState.OrderLogEntry(
        "SYSTEM",
        "TEXT",
        null,
        null,
        text,
        null,
        null,
        null,
        null,
        null,
        null,
        Instant.now()
    );
    appendEntry(order.uuid(), entry);
  }

  public void recordSystemHtml(OrderEntity order, String html) {
    if (order == null) {
      return;
    }
    BotState.OrderLogEntry entry = new BotState.OrderLogEntry(
        "SYSTEM",
        "HTML",
        null,
        null,
        html,
        null,
        null,
        null,
        null,
        null,
        null,
        Instant.now()
    );
    appendEntry(order.uuid(), entry);
  }

  public void clearLog(UUID orderId) {
    if (orderId == null) {
      return;
    }
    state.orderLogMap().remove(orderId);
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

    BotState.OrderLogEntry entry = new BotState.OrderLogEntry(
        direction,
        messageType,
        senderName,
        senderId,
        text,
        fileId,
        fileName,
        mimeType,
        message.getMessageId(),
        message.getReplyToMessage() != null ? message.getReplyToMessage().getMessageId() : null,
        message.getMessageThreadId(),
        createdAt
    );
    appendEntry(order.uuid(), entry);
    log.debug("🤖 TG Logged order message orderId={} direction={} type={}",
        order.uuid(), direction, entry.messageType());
  }

  private void appendEntry(UUID orderId, BotState.OrderLogEntry entry) {
    List<BotState.OrderLogEntry> list = state.orderLogMap()
        .computeIfAbsent(orderId, k -> new java.util.concurrent.CopyOnWriteArrayList<>());
    list.add(entry);
  }
}
