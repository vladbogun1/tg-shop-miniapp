package com.maxsolch.shop.i18n;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.LocaleResolver;
import org.springframework.web.servlet.i18n.AcceptHeaderLocaleResolver;

import java.util.List;
import java.util.Locale;

/**
 * How an HTTP request tells the backend which language to answer in.
 *
 * <p>The bot knows its reader from {@code users.locale}; an API call does not, and half of what a
 * customer sees is answered before they are even authenticated — the promo-code check in the cart
 * is a public endpoint, which is exactly where a Ukrainian customer was being told
 * "Промокод не найден".
 *
 * <p>So the apps send {@code Accept-Language} on every request. That header normally carries the
 * DEVICE language, which would be the wrong answer for anyone who switched the language by hand —
 * but here the app sets it from its own state, so it carries the language actually on screen.
 *
 * <p>The list of supported locales is what makes this safe: without it a phone set to German would
 * resolve to German and every lookup would silently fall through to the default bundle. Clamping
 * up front means an unsupported language is Ukrainian everywhere, consistently.
 */
@Configuration
public class LocaleConfig {

    @Bean
    public LocaleResolver localeResolver() {
        AcceptHeaderLocaleResolver resolver = new AcceptHeaderLocaleResolver();
        resolver.setSupportedLocales(List.of(
                Locale.forLanguageTag("uk"),
                Locale.forLanguageTag("ru"),
                Locale.forLanguageTag("en")));
        resolver.setDefaultLocale(Messages.FALLBACK);
        return resolver;
    }
}
