package com.maxsolch.shop.service;

import com.maxsolch.shop.service.BroadcastPhotoStore.Photo;
import com.maxsolch.shop.tg.ShopBot;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.methods.send.SendPhoto;
import org.telegram.telegrambots.meta.api.objects.InputFile;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.PhotoSize;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;

import java.io.ByteArrayInputStream;
import java.util.Comparator;
import java.util.List;

/**
 * Delivers one broadcast picture to many chats. The first send uploads the bytes; Telegram answers
 * with a {@code file_id}, and every later send passes that id instead of uploading again.
 *
 * <p>A photo caption is limited to 1024 characters (a text message: 4096). Short text goes as the
 * caption with the button under the photo; longer text goes as a plain photo followed by the text
 * message that carries the button.
 */
class BroadcastPhotoDelivery {

    /** Telegram's limit for a photo caption. */
    static final int CAPTION_LIMIT = 1024;

    private final ShopBot bot;
    private final Photo photo;
    private volatile String fileId;

    BroadcastPhotoDelivery(ShopBot bot, Photo photo) {
        this.bot = bot;
        this.photo = photo;
    }

    /** True when the text fits a photo caption (measured on the raw HTML — the safe side). */
    static boolean fitsCaption(String html) {
        return html != null && html.length() <= CAPTION_LIMIT;
    }

    /** The file_id Telegram gave back after the first successful upload; null before that. */
    String fileId() {
        return fileId;
    }

    void send(long chatId, String html, InlineKeyboardMarkup markup) throws TelegramApiException {
        String chat = String.valueOf(chatId);
        if (fitsCaption(html)) {
            sendPhoto(chat, html, markup);
            return;
        }
        sendPhoto(chat, null, null);
        bot.execute(SendMessage.builder()
                .chatId(chat)
                .text(html)
                .parseMode("HTML")
                .disableWebPagePreview(true)
                .replyMarkup(markup)
                .build());
    }

    private void sendPhoto(String chat, String caption, InlineKeyboardMarkup markup) throws TelegramApiException {
        String known = fileId;
        InputFile file = known != null
                ? new InputFile(known)
                : new InputFile(new ByteArrayInputStream(photo.bytes()), photo.filename());
        SendPhoto.SendPhotoBuilder b = SendPhoto.builder().chatId(chat).photo(file).replyMarkup(markup);
        if (caption != null) {
            b.caption(caption).parseMode("HTML");
        }
        Message sent = bot.sendPhoto(b.build());
        if (known == null) {
            fileId = largestFileId(sent);
        }
    }

    private static String largestFileId(Message sent) {
        List<PhotoSize> sizes = sent == null ? null : sent.getPhoto();
        if (sizes == null || sizes.isEmpty()) {
            return null;
        }
        return sizes.stream()
                .max(Comparator.comparingInt(BroadcastPhotoDelivery::area))
                .map(PhotoSize::getFileId)
                .orElse(null);
    }

    private static int area(PhotoSize p) {
        return (p.getWidth() == null ? 0 : p.getWidth()) * (p.getHeight() == null ? 0 : p.getHeight());
    }
}
