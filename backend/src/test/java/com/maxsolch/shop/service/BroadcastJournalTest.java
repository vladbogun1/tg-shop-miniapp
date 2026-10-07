package com.maxsolch.shop.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.journal.ActivityLog;
import com.maxsolch.shop.repository.BroadcastRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.tg.ShopBot;
import com.maxsolch.shop.web.dto.BroadcastResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.ApiResponse;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.exceptions.TelegramApiRequestException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Every message of a broadcast lands in «Журнал → Бот и сайт» with its outcome. */
class BroadcastJournalTest {

    private ShopBot bot;
    private UserRepository users;
    private ActivityLog activity;
    private BroadcastService service;

    @BeforeEach
    void setUp() throws Exception {
        bot = mock(ShopBot.class);
        users = mock(UserRepository.class);
        activity = mock(ActivityLog.class);
        when(activity.bot(any(), any())).thenCallRealMethod();
        AppProperties props = new AppProperties();
        props.getTelegram().setBotToken("123:test");
        service = new BroadcastService(bot, props, users, mock(BroadcastRepository.class), activity);
    }

    @Test
    void deliveredTestMessageIsJournaled() throws Exception {
        when(bot.execute(any(SendMessage.class))).thenReturn(new Message());

        BroadcastResult r = service.test("<b>Привет</b>", 42L, false, null);

        assertThat(r.ok()).isTrue();
        ActivityLog.Entry e = recorded();
        assertThat(e.source()).isEqualTo("BOT");
        assertThat(e.type()).isEqualTo("BROADCAST_TEST");
        assertThat(e.resultCode()).isEqualTo("OK");
        assertThat(e.tgUserId()).isEqualTo(42L);
        assertThat(e.summary()).isEqualTo("Привет");
    }

    @Test
    void blockedRecipientIsJournaledWithTheReason() throws Exception {
        ApiResponse<?> resp = new ObjectMapper().readValue(
                "{\"ok\":false,\"error_code\":403,\"description\":\"Forbidden: bot was blocked by the user\"}",
                ApiResponse.class);
        when(bot.execute(any(SendMessage.class))).thenThrow(new TelegramApiRequestException("Error sending message", resp));

        BroadcastResult r = service.test("hi", 7L, false, null);

        assertThat(r.ok()).isFalse();
        verify(users).markBotBlocked(eq(7L), any());
        ActivityLog.Entry e = recorded();
        assertThat(e.resultCode()).isEqualTo("FAILED");
        assertThat(e.errorCode()).isEqualTo("BOT_BLOCKED");
    }

    private ActivityLog.Entry recorded() {
        ArgumentCaptor<ActivityLog.Entry> c = ArgumentCaptor.forClass(ActivityLog.Entry.class);
        verify(activity).record(c.capture());
        return c.getValue();
    }
}
