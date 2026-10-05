package com.maxsolch.shop.web.dto;

/**
 * @param returnTo SITE (back to the order page on the site) or MINIAPP (a page that sends the
 *                 customer back to Telegram). Default: SITE for site sessions, MINIAPP otherwise.
 * @param locale   uk | ru | en — the site URL to come back to
 */
public record StartPaymentRequest(String returnTo, String locale) {
}
