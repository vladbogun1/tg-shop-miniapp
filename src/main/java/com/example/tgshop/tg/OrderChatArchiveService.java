package com.example.tgshop.tg;

import com.example.tgshop.order.OrderEntity;
import com.example.tgshop.order.OrderMessageEntity;
import com.example.tgshop.order.OrderMessageRepository;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class OrderChatArchiveService {

  private static final DateTimeFormatter DATE_HEADER =
      DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.forLanguageTag("ru"));
  private static final DateTimeFormatter TIME_FORMAT =
      DateTimeFormatter.ofPattern("HH:mm");
  private static final DateTimeFormatter TIME_TITLE =
      DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm:ss");

  private final OrderMessageRepository repository;
  private final TelegramSender sender;

  public OrderChatArchiveService(OrderMessageRepository repository, TelegramSender sender) {
    this.repository = repository;
    this.sender = sender;
  }

  public Optional<Path> buildArchive(OrderEntity order) {
    List<OrderMessageEntity> messages = repository.findByOrderIdOrderByCreatedAtAsc(order.getId());
    if (messages.isEmpty()) {
      return Optional.empty();
    }
    try {
      Path root = Files.createTempDirectory("tgshop-order-" + order.uuid());
      Path cssDir = Files.createDirectories(root.resolve("css"));
      Path jsDir = Files.createDirectories(root.resolve("js"));
      Path imagesDir = Files.createDirectories(root.resolve("images"));
      Path chatsDir = Files.createDirectories(root.resolve("chats"));

      Files.writeString(cssDir.resolve("style.css"), buildCss(), StandardCharsets.UTF_8);
      Files.writeString(jsDir.resolve("script.js"), buildJs(), StandardCharsets.UTF_8);
      writeIcons(imagesDir);

      Path html = root.resolve("messages.html");
      Files.writeString(html, buildHtml(order, messages, chatsDir), StandardCharsets.UTF_8);

      Path zip = Files.createTempFile("tgshop-order-" + order.uuid(), ".zip");
      zipDirectory(root, zip);
      return Optional.of(zip);
    } catch (Exception e) {
      log.error("🤖 TG Failed to build order archive for order {}", order.uuid(), e);
      return Optional.empty();
    }
  }

  private String buildHtml(OrderEntity order, List<OrderMessageEntity> messages, Path chatsDir) {
    String title = "Заказ " + order.uuid().toString().substring(0, 8)
        + " — " + order.getCustomerName();
    StringBuilder sb = new StringBuilder();
    sb.append("<!DOCTYPE html>\n<html>\n<head>\n")
        .append("<meta charset=\"utf-8\"/>\n")
        .append("<title>Exported Data</title>\n")
        .append("<meta content=\"width=device-width, initial-scale=1.0\" name=\"viewport\"/>\n")
        .append("<link href=\"css/style.css\" rel=\"stylesheet\"/>\n")
        .append("<script src=\"js/script.js\" type=\"text/javascript\"></script>\n")
        .append("</head>\n<body onload=\"CheckLocation();\">\n")
        .append("<div class=\"page_wrap\">\n")
        .append("<div class=\"page_header\"><div class=\"content\"><div class=\"text bold\">")
        .append(escapeHtml(title))
        .append("</div></div></div>\n")
        .append("<div class=\"page_body chat_page\"><div class=\"history\">\n");

    Instant lastDate = null;
    int messageIndex = 1;
    for (OrderMessageEntity entry : messages) {
      Instant ts = entry.getCreatedAt();
      if (ts != null && (lastDate == null || !sameDay(lastDate, ts))) {
        sb.append("<div class=\"message service\" id=\"message-")
            .append(messageIndex++)
            .append("\"><div class=\"body details\">")
            .append(DATE_HEADER.format(ts.atZone(ZoneId.systemDefault())))
            .append("</div></div>\n");
        lastDate = ts;
      }
      int messageId = entry.getTgMessageId() != null ? entry.getTgMessageId() : messageIndex;
      sb.append(renderMessage(entry, messageId, chatsDir, order.uuid().toString()));
      if (entry.getTgMessageId() == null) {
        messageIndex++;
      }
    }

    sb.append("</div></div></div></body></html>");
    return sb.toString();
  }

  private String renderMessage(OrderMessageEntity entry, int id, Path chatsDir, String orderKey) {
    if ("SYSTEM".equalsIgnoreCase(entry.getDirection())) {
      String body = "HTML".equalsIgnoreCase(entry.getMessageType())
          ? entry.getText()
          : escapeHtml(entry.getText());
      return "<div class=\"message service\" id=\"message" + id + "\">"
          + "<div class=\"body details\">" + body + "</div></div>\n";
    }

    String initials = buildInitials(entry.getSenderName());
    String fromName = entry.getSenderName() != null ? entry.getSenderName() : entry.getDirection();
    String time = entry.getCreatedAt() != null
        ? TIME_FORMAT.format(entry.getCreatedAt().atZone(ZoneId.systemDefault()))
        : "";
    String title = entry.getCreatedAt() != null
        ? TIME_TITLE.format(entry.getCreatedAt().atZone(ZoneId.systemDefault()))
        : "";

    StringBuilder sb = new StringBuilder();
    sb.append("<div class=\"message default clearfix\" id=\"message").append(id).append("\">")
        .append("<div class=\"pull_left userpic_wrap\">")
        .append("<div class=\"userpic userpic5\" style=\"width: 42px; height: 42px\">")
        .append("<div class=\"initials\" style=\"line-height: 42px\">").append(initials).append("</div>")
        .append("</div></div>")
        .append("<div class=\"body\">")
        .append("<div class=\"pull_right date details\" title=\"").append(title).append("\">")
        .append(time).append("</div>")
        .append("<div class=\"from_name\">").append(escapeHtml(fromName)).append("</div>");

    if (entry.getTgReplyToMessageId() != null) {
      sb.append("<div class=\"reply_to details\">")
          .append("In reply to <a href=\"#go_to_message")
          .append(entry.getTgReplyToMessageId())
          .append("\" onclick=\"return GoToMessage(")
          .append(entry.getTgReplyToMessageId())
          .append(")\">this message</a></div>");
    }

    if (entry.getText() != null && !entry.getText().isBlank()) {
      sb.append("<div class=\"text\">").append(formatText(entry.getText())).append("</div>");
    }

    String media = renderMedia(entry, chatsDir, orderKey);
    if (media != null) {
      sb.append(media);
    }

    sb.append("</div></div>\n");
    return sb.toString();
  }

  private String renderMedia(OrderMessageEntity entry, Path chatsDir, String orderKey) {
    if (entry.getFileId() == null || entry.getFileId().isBlank()) {
      return null;
    }
    Path orderDir = chatsDir.resolve("order_" + orderKey);
    Path filesDir = orderDir.resolve("files");
    try {
      Files.createDirectories(filesDir);
    } catch (IOException e) {
      log.warn("🤖 TG Unable to create archive files directory", e);
      return null;
    }

    String fileName = entry.getFileName();
    Path downloaded = downloadFile(entry.getFileId());
    if (downloaded == null) {
      return null;
    }
    String ext = getExtension(downloaded.getFileName().toString());
    if (fileName == null || fileName.isBlank()) {
      fileName = entry.getMessageType().toLowerCase() + "_" + entry.getTgMessageId() + ext;
    }
    Path target = filesDir.resolve(fileName);
    try {
      Files.copy(downloaded, target);
    } catch (IOException e) {
      log.warn("🤖 TG Unable to copy archive file {}", fileName, e);
      return null;
    }
    String relPath = "chats/order_" + orderKey + "/files/" + fileName;

    if ("PHOTO".equalsIgnoreCase(entry.getMessageType())) {
      return "<div class=\"media_wrap clearfix\">"
          + "<a class=\"photo_wrap clearfix pull_left\" href=\"" + relPath + "\">"
          + "<img class=\"photo\" src=\"" + relPath + "\"/></a></div>";
    }

    return "<div class=\"media_wrap clearfix\">"
        + "<a class=\"media_file\" href=\"" + relPath + "\">"
        + escapeHtml(fileName) + "</a></div>";
  }

  private Path downloadFile(String fileId) {
    java.io.File file = sender.downloadFile(fileId);
    if (file == null) {
      return null;
    }
    return file.toPath();
  }

  private static boolean sameDay(Instant a, Instant b) {
    return a.atZone(ZoneId.systemDefault()).toLocalDate()
        .equals(b.atZone(ZoneId.systemDefault()).toLocalDate());
  }

  private static String buildInitials(String name) {
    if (name == null || name.isBlank()) {
      return "?";
    }
    String[] parts = name.trim().split("\\s+");
    if (parts.length == 1) {
      return parts[0].substring(0, 1).toUpperCase(Locale.ROOT);
    }
    return (parts[0].substring(0, 1) + parts[1].substring(0, 1)).toUpperCase(Locale.ROOT);
  }

  private static String formatText(String text) {
    return escapeHtml(text).replace("\n", "<br>");
  }

  private static String escapeHtml(String s) {
    if (s == null) return "";
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
  }

  private static String getExtension(String name) {
    int idx = name.lastIndexOf('.');
    return idx >= 0 ? name.substring(idx) : "";
  }

  private static String buildCss() {
    return """
body { margin: 0; font: 13px/18px 'Open Sans', Arial, sans-serif; background:#1a2026; }
.page_wrap { color: #fff; background:#1a2026; min-height:100vh; }
.page_header { position: fixed; width:100%; background:#1a2026; border-bottom:1px solid #2c333d; z-index:10;}
.page_header .content { width: 520px; margin:0 auto; }
.page_header .text { padding: 20px 24px; font-size: 20px; }
.page_body { padding-top: 64px; width: 520px; margin:0 auto; }
.history { padding: 16px 0; }
.message { margin: 0 -10px; }
.service { padding: 10px 24px; text-align:center; color:#91979e; }
.default { padding: 10px; }
.default .body { margin-left: 60px; }
.from_name { color:#4db8ff; font-weight:700; padding-bottom:4px; }
.date { color:#91979e; font-size:11px; }
.text { line-height: 150%; word-wrap:break-word; }
.userpic { border-radius:50%; background:#9884e8; color:#fff; text-align:center; }
.initials { font-weight:700; }
.pull_left { float:left; }
.pull_right { float:right; }
.clearfix:after { content:" "; display:block; clear:both; }
.media_wrap { padding-top:6px; }
.photo { max-width: 260px; border-radius: 6px; }
.media_file { color:#4db8ff; text-decoration:none; }
code { padding:2px 4px; font-size:90%; color:#ff8aac; background:#2c333d; border-radius:4px; }
""";
  }

  private static String buildJs() {
    return """
"use strict";
function CheckLocation() {}
function GoToMessage(id) { return false; }
""";
  }

  private static void writeIcons(Path imagesDir) throws IOException {
    Files.writeString(imagesDir.resolve("media_photo.svg"),
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" fill=\"#4db8ff\" viewBox=\"0 0 24 24\"><path d=\"M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm0 2v10h16V7H4zm3 9 3-4 2 3 3-4 4 5H7z\"/></svg>");
    Files.writeString(imagesDir.resolve("media_file.svg"),
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" fill=\"#4db8ff\" viewBox=\"0 0 24 24\"><path d=\"M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5\"/></svg>");
  }

  private static void zipDirectory(Path sourceDir, Path zipFile) throws IOException {
    try (ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(zipFile))) {
      Files.walk(sourceDir).filter(path -> !Files.isDirectory(path)).forEach(path -> {
        String entryName = sourceDir.relativize(path).toString().replace("\\", "/");
        try (InputStream in = Files.newInputStream(path)) {
          zos.putNextEntry(new ZipEntry(entryName));
          in.transferTo(zos);
          zos.closeEntry();
        } catch (IOException e) {
          throw new RuntimeException(e);
        }
      });
    }
  }
}
