package com.maxsolch.shop.support;

/** Support events, handled after the commit (Telegram, Web Push). */
public final class SupportEvents {

    private SupportEvents() {
    }

    /**
     * A message was posted to a thread.
     *
     * @param fromAdmin true = the shop answered (DM the customer); false = the customer wrote
     *                  (ping the admins)
     * @param newThread the message opened a new thread
     * @param preview   short text for notifications ("📷 Фото" for a picture without text)
     */
    public record MessagePosted(byte[] threadId, boolean fromAdmin, boolean newThread, String preview) {
    }
}
