package com.maxsolch.shop.i18n;

import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.context.support.ResourceBundleMessageSource;

import java.util.Locale;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;

/**
 * The customer-facing wording actually comes out in the customer's language.
 *
 * <p>Wired with the same {@code MessageSource} settings as production (basename, UTF-8, no
 * system-locale fallback) so the bundles are exercised as they will be at runtime, not as a mock
 * pretends they are.
 */
@ExtendWith(MockitoExtension.class)
class MessagesTest {

    @Mock
    UserRepository userRepository;

    Messages messages;

    @BeforeEach
    void setUp() {
        ResourceBundleMessageSource source = new ResourceBundleMessageSource();
        source.setBasename("i18n/messages");
        source.setDefaultEncoding("UTF-8");
        source.setFallbackToSystemLocale(false);
        messages = new Messages((MessageSource) source, userRepository);
    }

    @Test
    void promoRejectionSpeaksEachLanguage() {
        assertThat(messages.get(Locale.forLanguageTag("ru"), "api.promo.notFound"))
                .isEqualTo("Промокод не найден");
        assertThat(messages.get(Locale.forLanguageTag("uk"), "api.promo.notFound"))
                .isEqualTo("Промокод не знайдено");
        assertThat(messages.get(Locale.forLanguageTag("en"), "api.promo.notFound"))
                .isEqualTo("Promo code not found");
    }

    /** An unsupported language must land on Ukrainian, not on whatever the server's locale is. */
    @Test
    void unsupportedLanguageFallsBackToUkrainian() {
        assertThat(messages.get(Locale.GERMAN, "api.promo.notFound"))
                .isEqualTo(messages.get(Locale.forLanguageTag("uk"), "api.promo.notFound"));
    }

    @Test
    void argumentsAreInterpolated() {
        assertThat(messages.get(Locale.forLanguageTag("en"), "api.order.unavailable", "ATK 99G"))
                .isEqualTo("Out of stock: ATK 99G");
    }

    /** {@code current()} is what controllers call; it follows the language of the request. */
    @Test
    void currentFollowsTheRequestLocale() {
        LocaleContextHolder.setLocale(Locale.forLanguageTag("en"));
        try {
            assertThat(messages.current("api.promo.expired"))
                    .isEqualTo("This promo code is no longer valid");
        } finally {
            LocaleContextHolder.resetLocaleContext();
        }
    }

    @Test
    void aPickedLanguageBeatsWhatTelegramReports() {
        User user = new User();
        user.setLanguageCode("ru");
        user.setLocale("en");

        assertThat(messages.localeOf(user)).isEqualTo(Locale.forLanguageTag("en"));
    }

    @Test
    void telegramLanguageIsUsedWhenNothingWasPicked() {
        User user = new User();
        user.setLanguageCode("ru");

        assertThat(messages.localeOf(user)).isEqualTo(Locale.forLanguageTag("ru"));
    }

    @Test
    void anUnknownCustomerGetsTheFallback() {
        lenient().when(userRepository.findById(42L)).thenReturn(Optional.empty());

        assertThat(messages.localeOf(42L)).isEqualTo(Messages.FALLBACK);
    }
}
