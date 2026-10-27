package com.maxsolch.shop.preorder;

import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.journal.ActivityLog;
import com.maxsolch.shop.preorder.PreorderDtos.EtaDto;
import com.maxsolch.shop.preorder.PreorderDtos.MyPreorderDto;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.tg.ShopBot;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.MessageSource;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** The queue's bot messages: customer's language, the hold time in Kyiv, the right Mini App button. */
@ExtendWith(MockitoExtension.class)
class PreorderNotifierTest {

    static final long USER = 42L;
    static final String PRODUCT = "79c3e54e-0000-4000-8000-000000000001";

    @Mock ShopBot bot;
    @Mock UserRepository users;
    @Mock ActivityLog activity;
    @Mock PreorderQueueService queue;

    AppProperties props = new AppProperties();
    PreorderNotifier notifier;

    @BeforeEach
    void setUp() throws Exception {
        ResourceBundleMessageSource source = new ResourceBundleMessageSource();
        source.setBasename("i18n/messages");
        source.setDefaultEncoding("UTF-8");
        source.setFallbackToSystemLocale(false);
        props.getTelegram().setBotToken("test-token");
        props.setWebappBaseUrl("https://app.example.test");
        notifier = new PreorderNotifier(queue, bot, props, new Messages((MessageSource) source, users), activity);
        lenient().when(activity.bot(any(), any())).thenAnswer(inv -> ((ActivityLog.BotCall<?>) inv.getArgument(1)).call());
    }

    private void speaks(String locale) {
        User u = new User();
        u.setTelegramUserId(USER);
        u.setLocale(locale);
        when(users.findById(USER)).thenReturn(Optional.of(u));
    }

    private void place(String status, int qty, Integer position, int heldQty, Instant holdUntil, EtaDto eta) {
        MyPreorderDto p = new MyPreorderDto(7, PRODUCT, null, "MCHOSE Ace 68", "mchose-ace-68", null, null, qty,
                status, position, heldQty, holdUntil, Instant.parse("2026-10-27T10:00:00Z"), eta);
        when(queue.describe(7L)).thenReturn(Optional.of(new PreorderQueueService.Described(USER, p, 719900)));
    }

    private SendMessage sent() throws Exception {
        ArgumentCaptor<SendMessage> msg = ArgumentCaptor.forClass(SendMessage.class);
        verify(bot).execute(msg.capture());
        return msg.getValue();
    }

    private static String startApp(SendMessage m) {
        return ((InlineKeyboardMarkup) m.getReplyMarkup()).getKeyboard().get(0).get(0).getWebApp().getUrl();
    }

    @Test
    void joiningTellsThePlaceAndTheRangeInUkrainian() throws Exception {
        speaks("uk");
        place("WAITING", 2, 3, 0, null, new EtaDto("in_transit", "RANGE",
                LocalDate.of(2026, 11, 10), LocalDate.of(2026, 11, 20), null, null));

        notifier.onSubscribed(new PreorderEvents.Subscribed(7));

        SendMessage m = sent();
        assertThat(m.getChatId()).isEqualTo("42");
        assertThat(m.getText()).contains("Ви в черзі", "MCHOSE Ace 68", "№3", "2 шт.", "Очікуємо: 10.11 – 20.11");
        assertThat(startApp(m)).isEqualTo("https://app.example.test?startapp=preorders");
    }

    @Test
    void joiningWithoutABatchIsJustNotifyMe() throws Exception {
        speaks("en");
        place("WAITING", 1, 1, 0, null, null);

        notifier.onSubscribed(new PreorderEvents.Subscribed(7));

        assertThat(sent().getText()).contains("We will let you know").doesNotContain("Place");
    }

    @Test
    void holdShowsKyivTimeThePriceAndTheShortfall() throws Exception {
        speaks("ru");
        place("HELD", 3, null, 2, Instant.parse("2026-11-12T15:00:00Z"), null);

        notifier.onHoldGranted(new PreorderEvents.HoldGranted(7));

        SendMessage m = sent();
        assertThat(m.getText()).contains("Приехало", "2 шт.", "17:00, 12.11", "7 199", "остальное (1 шт.)");
        assertThat(startApp(m)).endsWith("startapp=pp_" + PRODUCT);
    }

    @Test
    void approxEtaAndCancelledBatch() throws Exception {
        speaks("uk");
        place("WAITING", 1, 1, 0, null, new EtaDto("ordered", "APPROX", null, null, 2, null));
        notifier.onSubscribed(new PreorderEvents.Subscribed(7));
        assertThat(sent().getText()).contains("~2 тиж.");
    }

    @Test
    void cancelledBatchHasItsOwnText() throws Exception {
        speaks("uk");
        place("CANCELLED", 1, null, 0, null, null);

        notifier.onClosed(new PreorderEvents.Closed(7, "BATCH_CANCELLED"));

        assertThat(sent().getText()).contains("Поставку скасовано");
    }

    @Test
    void noTokenNoMessage() {
        props.getTelegram().setBotToken("");

        notifier.onHoldExpired(new PreorderEvents.HoldExpired(7));

        verifyNoInteractions(bot, queue);
    }

    @Test
    void localWebappUrlSendsTheTextWithoutAButton() throws Exception {
        props.setWebappBaseUrl("http://localhost:3004");
        speaks("uk");
        place("HELD", 1, null, 1, Instant.parse("2026-11-12T15:00:00Z"), null);

        notifier.onHoldEnding(new PreorderEvents.HoldEnding(7));

        SendMessage m = sent();
        assertThat(m.getText()).contains("Бронь закінчується о 17:00");
        assertThat(m.getReplyMarkup()).isNull();
    }
}
