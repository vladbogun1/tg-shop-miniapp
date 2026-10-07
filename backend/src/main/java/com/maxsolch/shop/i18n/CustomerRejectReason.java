package com.maxsolch.shop.i18n;

import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The rejection reason of an order as the CUSTOMER should read it.
 *
 * <p>{@code orders.reject_reason} is written for the seller, in Russian. Most of it is free text an
 * admin typed — that is passed through untouched (machine-mangling a person's explanation is worse
 * than leaving it). But three reasons are written by the shop itself, and those were showing up in
 * Russian on a Ukrainian or English order page and in the bot:
 * <ul>
 *   <li>{@value #BY_CUSTOMER} [: preset or own words] — the customer cancelled an unpaid order;</li>
 *   <li>{@value #BY_REQUEST}: … — the admin approved the customer's cancellation request;</li>
 *   <li>{@value #UNPAID_PREFIX}N ч — the payment window ran out ({@code PAYMENT_TIMEOUT}).</li>
 * </ul>
 * Those are recognised by their prefix and rebuilt in the customer's language; the cancellation
 * presets the apps send (Russian, so the seller can read them) are translated back too.
 */
@Component
public class CustomerRejectReason {

    /** Written by {@code OrderService.cancelByCustomer}. */
    public static final String BY_CUSTOMER = "Отменён покупателем";
    /** Written by {@code OrderService.approveCancelRequest}. */
    public static final String BY_REQUEST = "Отменён по запросу покупателя";
    /** Written by {@code OrderService.expireUnpaid}: "Не оплачен в течение 24 ч". */
    public static final String UNPAID_PREFIX = "Не оплачен в течение ";

    private static final Pattern UNPAID = Pattern.compile("^" + Pattern.quote(UNPAID_PREFIX) + "(\\d+) ч$");

    /**
     * The cancellation presets of the Mini App and the site (their {@code CANCEL_REASONS}), as sent
     * to the server → the bundle key with the customer's wording.
     */
    private static final Map<String, String> PRESETS = Map.of(
            "Проблема с оплатой / картой", "api.cancelReason.payment",
            "Передумал(а)", "api.cancelReason.changedMind",
            "Оформил(а) по ошибке", "api.cancelReason.mistake",
            "Нашёл(ла) дешевле", "api.cancelReason.cheaper",
            "Другое", "api.cancelReason.other");

    private final Messages messages;

    public CustomerRejectReason(Messages messages) {
        this.messages = messages;
    }

    /** In the language of the current request (customer endpoints). */
    public String current(String stored) {
        return localize(stored, org.springframework.context.i18n.LocaleContextHolder.getLocale());
    }

    /** In the given language (bot messages). Null/blank stays as it is. */
    public String localize(String stored, Locale locale) {
        if (stored == null || stored.isBlank()) {
            return stored;
        }
        String s = stored.trim();
        Matcher unpaid = UNPAID.matcher(s);
        if (unpaid.matches()) {
            return messages.get(locale, "api.reject.unpaid", Integer.parseInt(unpaid.group(1)));
        }
        if (s.equals(BY_CUSTOMER)) {
            return messages.get(locale, "api.reject.byCustomer");
        }
        if (s.startsWith(BY_CUSTOMER + ": ")) {
            return messages.get(locale, "api.reject.byCustomerReason", reason(s.substring(BY_CUSTOMER.length() + 2), locale));
        }
        if (s.startsWith(BY_REQUEST + ": ")) {
            return messages.get(locale, "api.reject.byRequest", reason(s.substring(BY_REQUEST.length() + 2), locale));
        }
        if (s.equals(BY_REQUEST + ":") || s.equals(BY_REQUEST)) {
            return messages.get(locale, "api.reject.byCustomer");
        }
        return stored;
    }

    private String reason(String text, Locale locale) {
        String key = PRESETS.get(text.trim());
        return key == null ? text.trim() : messages.get(locale, key);
    }
}
