package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.platform.util.UuidUtil;

/** The addresses given to monobank with an invoice: where the browser returns after paying, where the webhook goes. */
final class PaymentReturnUrls {

    private final AppProperties props;

    PaymentReturnUrls(AppProperties props) {
        this.props = props;
    }

    /**
     * Where monobank sends the browser after paying. Embedded (iframe): a tiny page that only tells
     * the parent window "done" (postMessage) — the parent polls our API for the real status.
     */
    String redirectUrl(Order order, OnlinePaymentService.ReturnTo returnTo, String locale, boolean embedded) {
        String id = UuidUtil.toString(order.getId());
        String lang = locale == null || locale.isBlank() ? "uk" : locale;
        String prefix = "uk".equals(lang) ? "" : "/" + lang;
        String embed = embedded ? "&embedded=1" : "";
        if (returnTo == OnlinePaymentService.ReturnTo.MINIAPP) {
            // Opened from the Mini App in a browser: a small page that sends them back to Telegram.
            return trimSlash(props.getWebappBaseUrl()) + "/pay-return?order=" + id + "&lang=" + lang + embed;
        }
        if (embedded) {
            return trimSlash(props.getSite().getBaseUrl()) + prefix + "/pay-return?order=" + id + embed;
        }
        return trimSlash(props.getSite().getBaseUrl()) + prefix + "/account/orders/" + id + "?payment=return";
    }

    String webhookUrl() {
        String configured = props.getPayment().getMonobank().getWebhookUrl();
        if (configured != null && !configured.isBlank()) {
            return configured;
        }
        return trimSlash(props.getSite().getBaseUrl()) + "/api/payments/mono/webhook";
    }

    private static String trimSlash(String s) {
        if (s == null) {
            return "";
        }
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }
}
