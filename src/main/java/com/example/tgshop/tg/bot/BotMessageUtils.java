package com.example.tgshop.tg.bot;

import org.telegram.telegrambots.meta.api.objects.Message;

public final class BotMessageUtils {
    private BotMessageUtils() {}

    public static String escapeHtml(String text) {
        if (text == null) {
            return "";
        }
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    public static String extractMessageBody(Message message) {
        if (message == null) {
            return null;
        }
        if (message.hasText()) {
            return message.getText();
        }
        if (message.getCaption() != null) {
            return message.getCaption();
        }
        return null;
    }

    public static boolean isMediaMessage(Message message) {
        if (message == null) {
            return false;
        }
        return message.hasPhoto()
            || message.hasDocument()
            || message.hasVideo()
            || message.hasAudio()
            || message.hasVoice()
            || message.hasAnimation()
            || message.hasVideoNote()
            || message.hasSticker()
            || message.hasContact()
            || message.hasLocation();
    }

    public static String buildUserReference(long userId, String username) {
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

    public static String buildTopicLink(long chatId, int threadId) {
        String abs = String.valueOf(Math.abs(chatId));
        String chatPart = abs.startsWith("100") ? abs.substring(3) : abs;
        return "https://t.me/c/" + chatPart + "/" + threadId;
    }
}
