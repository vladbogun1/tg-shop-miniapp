package com.maxsolch.shop.platform.error;

import java.text.MessageFormat;
import java.util.Locale;
import java.util.MissingResourceException;
import java.util.ResourceBundle;

/**
 * The Russian text of an {@link ErrorCode}, read straight from the bundle, for places that have no request:
 * {@link DomainException#getMessage()} in logs, test assertions and the rare caller that quotes another error.
 * What a client receives is always looked up by {@code Messages.current} in the language of the request.
 */
final class ErrorTexts {

    private static final Locale RU = Locale.forLanguageTag("ru");

    private ErrorTexts() {
    }

    static String russian(ErrorCode code, Object[] args) {
        String key = code.messageKey();
        try {
            String pattern = bundle().getString(key);
            return args.length == 0 ? pattern : new MessageFormat(pattern, RU).format(args);
        } catch (MissingResourceException e) {
            return key;
        }
    }

    /** ResourceBundle caches the loaded bundle itself, so there is nothing to memoise here. */
    private static ResourceBundle bundle() {
        return ResourceBundle.getBundle("i18n/messages", RU);
    }
}
