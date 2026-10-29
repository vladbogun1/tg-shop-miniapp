package com.maxsolch.shop.tg;

import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.platform.i18n.CustomerRejectReason;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.platform.settings.SettingsService;
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
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The bot DMs the case promo code in the customer's language, with the cart button. */
@ExtendWith(MockitoExtension.class)
class CasePromoNotificationTest {

    @Mock ShopBot bot;
    @Mock UserRepository users;
    @Mock SettingsService settings;
    @Mock CustomerRejectReason rejectReason;
    @Mock ActivityLog activity;

    NotificationService service;

    @BeforeEach
    void setUp() throws Exception {
        ResourceBundleMessageSource source = new ResourceBundleMessageSource();
        source.setBasename("i18n/messages");
        source.setDefaultEncoding("UTF-8");
        source.setFallbackToSystemLocale(false);
        AppProperties props = new AppProperties();
        props.getTelegram().setBotToken("test-token");
        props.setWebappBaseUrl("https://app.example.test");
        Messages messages = new Messages((MessageSource) source, users);
        service = new NotificationService(props, messages, settings, rejectReason,
                new CustomerBot(bot, props, messages, activity), new SellerChannel(bot, props, activity));
        lenient().when(activity.bot(any(), any())).thenAnswer(inv -> ((ActivityLog.BotCall<?>) inv.getArgument(1)).call());
    }

    private Order order(Long tgUserId) {
        Order o = new Order();
        o.setId(new byte[16]);
        o.setTgUserId(tgUserId);
        o.setCurrency("₴");
        return o;
    }

    private void speaks(long tgUserId, String locale) {
        User u = new User();
        u.setTelegramUserId(tgUserId);
        u.setLocale(locale);
        when(users.findById(tgUserId)).thenReturn(Optional.of(u));
    }

    private SendMessage sent() throws Exception {
        ArgumentCaptor<SendMessage> msg = ArgumentCaptor.forClass(SendMessage.class);
        verify(bot).execute(msg.capture());
        return msg.getValue();
    }

    @Test
    void percentCodeInUkrainianWithCartButton() throws Exception {
        speaks(100L, "uk");
        service.notifyCustomerCasePromo(order(100L), "CASE-ABC123", 10, 0, Instant.parse("2026-11-18T10:00:00Z"));

        SendMessage m = sent();
        assertThat(m.getChatId()).isEqualTo("100");
        assertThat(m.getText())
                .contains("Знижка з кейса")
                .contains("<b>−10%</b>")
                .contains("<code>CASE-ABC123</code>")
                .contains("18.11.2026");
        InlineKeyboardMarkup kb = (InlineKeyboardMarkup) m.getReplyMarkup();
        assertThat(kb.getKeyboard().get(0).get(0).getText()).isEqualTo("🛍 До кошика");
        assertThat(kb.getKeyboard().get(0).get(0).getWebApp().getUrl()).isEqualTo("https://app.example.test?startapp=cart");
    }

    @Test
    void amountCodeInEnglish() throws Exception {
        speaks(200L, "en");
        service.notifyCustomerCasePromo(order(200L), "CASE-XYZ", 0, 15_000, Instant.parse("2026-11-18T10:00:00Z"));

        assertThat(sent().getText())
                .contains("A discount from your case")
                .contains("<b>−150 ₴</b>")
                .contains("Valid until 18.11.2026");
    }

    @Test
    void noTelegramChatNoMessage() {
        service.notifyCustomerCasePromo(order(null), "CASE-ABC123", 10, 0, Instant.now());
        verifyNoInteractions(bot);
    }
}
