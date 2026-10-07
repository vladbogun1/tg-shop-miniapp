package com.maxsolch.shop.i18n;

import com.maxsolch.shop.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.MessageSource;
import org.springframework.context.support.ResourceBundleMessageSource;

import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Reasons the shop writes itself (in Russian, for the seller) reach the customer in their language;
 * an admin's own words pass through untouched.
 */
class CustomerRejectReasonTest {

    private static final Locale UK = Locale.forLanguageTag("uk");
    private static final Locale EN = Locale.forLanguageTag("en");
    private static final Locale RU = Locale.forLanguageTag("ru");

    CustomerRejectReason reasons;
    Messages messages;

    @BeforeEach
    void setUp() {
        ResourceBundleMessageSource source = new ResourceBundleMessageSource();
        source.setBasename("i18n/messages");
        source.setDefaultEncoding("UTF-8");
        source.setFallbackToSystemLocale(false);
        messages = new Messages((MessageSource) source, mock(UserRepository.class));
        reasons = new CustomerRejectReason(messages);
    }

    @Test
    void cancelledByCustomerWithPreset() {
        String stored = CustomerRejectReason.BY_CUSTOMER + ": Передумал(а)";
        assertThat(reasons.localize(stored, UK)).isEqualTo("Скасовано вами: Передумав(ла)");
        assertThat(reasons.localize(stored, EN)).isEqualTo("Cancelled by you: Changed my mind");
        assertThat(reasons.localize(stored, RU)).isEqualTo("Отменён вами: Передумал(а)");
    }

    @Test
    void cancelledByCustomerOwnWordsAndBare() {
        assertThat(reasons.localize(CustomerRejectReason.BY_CUSTOMER + ": дорого", EN))
                .isEqualTo("Cancelled by you: дорого");
        assertThat(reasons.localize(CustomerRejectReason.BY_CUSTOMER, UK)).isEqualTo("Скасовано вами");
    }

    @Test
    void cancelledOnRequest() {
        assertThat(reasons.localize(CustomerRejectReason.BY_REQUEST + ": Нашёл(ла) дешевле", EN))
                .isEqualTo("Cancelled at your request: Found it cheaper");
    }

    @Test
    void paymentTimeout() {
        assertThat(reasons.localize(CustomerRejectReason.UNPAID_PREFIX + "24 ч", EN))
                .isEqualTo("The order was not paid within 24 h and was cancelled automatically");
        assertThat(reasons.localize(CustomerRejectReason.UNPAID_PREFIX + "24 ч", UK)).contains("24 год");
    }

    @Test
    void adminTextPassesThrough() {
        assertThat(reasons.localize("Нет в наличии, извините", EN)).isEqualTo("Нет в наличии, извините");
        assertThat(reasons.localize(null, EN)).isNull();
    }

    @Test
    void chatPreviewPlaceholders() {
        assertThat(ChatPreview.localize(ChatPreview.PHOTO, EN, messages)).isEqualTo(messages.get(EN, "api.chat.photo"));
        assertThat(ChatPreview.localize(ChatPreview.FILE, UK, messages)).isEqualTo(messages.get(UK, "api.chat.file"));
        assertThat(ChatPreview.localize("📎 invoice.pdf", EN, messages)).isEqualTo("📎 invoice.pdf");
    }
}
