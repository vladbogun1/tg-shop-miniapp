package com.maxsolch.shop.service;

import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.journal.ActivityLog;
import com.maxsolch.shop.repository.BroadcastRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.tg.ShopBot;
import com.maxsolch.shop.web.dto.BroadcastResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.methods.send.SendPhoto;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.PhotoSize;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Broadcast picture: caption vs photo + text, file_id reuse, upload validation. */
class BroadcastPhotoTest {

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x00, 0x01};

    private ShopBot bot;
    private BroadcastPhotoStore store;
    private BroadcastService service;

    @BeforeEach
    void setUp() throws Exception {
        bot = mock(ShopBot.class);
        store = new BroadcastPhotoStore();
        ActivityLog activity = mock(ActivityLog.class);
        when(activity.bot(any(), any())).thenCallRealMethod();
        AppProperties props = new AppProperties();
        props.getTelegram().setBotToken("123:test");
        service = new BroadcastService(bot, props, mock(UserRepository.class),
                mock(BroadcastRepository.class), activity, store);
        Message sent = new Message();
        PhotoSize small = new PhotoSize();
        small.setFileId("small");
        small.setWidth(90);
        small.setHeight(90);
        PhotoSize big = new PhotoSize();
        big.setFileId("big");
        big.setWidth(1280);
        big.setHeight(720);
        sent.setPhoto(List.of(small, big));
        when(bot.sendPhoto(any(SendPhoto.class))).thenReturn(sent);
        when(bot.execute(any(SendMessage.class))).thenReturn(new Message());
    }

    @Test
    void captionLimitIs1024() {
        assertThat(BroadcastPhotoDelivery.fitsCaption("a".repeat(1024))).isTrue();
        assertThat(BroadcastPhotoDelivery.fitsCaption("a".repeat(1025))).isFalse();
    }

    @Test
    void shortTextGoesAsCaptionWithTheButton() throws Exception {
        String id = store.put(JPEG);

        BroadcastResult r = service.test("<b>hi</b>", 5L, false, null, id);

        assertThat(r.ok()).isTrue();
        ArgumentCaptor<SendPhoto> c = ArgumentCaptor.forClass(SendPhoto.class);
        verify(bot).sendPhoto(c.capture());
        assertThat(c.getValue().getCaption()).isEqualTo("<b>hi</b>");
        assertThat(c.getValue().getParseMode()).isEqualTo("HTML");
        verify(bot, never()).execute(any(SendMessage.class));
    }

    @Test
    void longTextGoesAsPlainPhotoThenTextMessage() throws Exception {
        String id = store.put(JPEG);
        String text = "x".repeat(1500);

        service.test(text, 5L, false, null, id);

        ArgumentCaptor<SendPhoto> c = ArgumentCaptor.forClass(SendPhoto.class);
        verify(bot).sendPhoto(c.capture());
        assertThat(c.getValue().getCaption()).isNull();
        ArgumentCaptor<SendMessage> m = ArgumentCaptor.forClass(SendMessage.class);
        verify(bot).execute(m.capture());
        assertThat(m.getValue().getText()).isEqualTo(text);
    }

    @Test
    void fileIdFromTheFirstSendIsReused() throws Exception {
        BroadcastPhotoDelivery d = new BroadcastPhotoDelivery(bot,
                new BroadcastPhotoStore.Photo(JPEG, "image/jpeg", "broadcast.jpg"));

        d.send(1L, "one", null);
        d.send(2L, "two", null);

        assertThat(d.fileId()).isEqualTo("big");
        ArgumentCaptor<SendPhoto> c = ArgumentCaptor.forClass(SendPhoto.class);
        verify(bot, times(2)).sendPhoto(c.capture());
        assertThat(c.getAllValues().get(0).getPhoto().isNew()).isTrue();
        assertThat(c.getAllValues().get(1).getPhoto().isNew()).isFalse();
        assertThat(c.getAllValues().get(1).getPhoto().getAttachName()).isEqualTo("big");
    }

    @Test
    void withoutPhotoIdItIsAPlainTextMessage() throws Exception {
        service.test("hi", 5L, false, null, null);

        verify(bot).execute(any(SendMessage.class));
        verify(bot, never()).sendPhoto(any());
    }

    @Test
    void uploadIsValidatedAndExpiredIdIsRefused() {
        assertThatThrownBy(() -> store.put(new byte[]{1, 2, 3, 4}))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> store.put(new byte[BroadcastPhotoStore.MAX_BYTES + 1]))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.test("hi", 5L, false, null, "unknown"))
                .isInstanceOf(ResponseStatusException.class);
        assertThat(BroadcastPhotoStore.sniff("RIFF....WEBPVP8 ".getBytes())).isEqualTo("image/webp");
    }
}
