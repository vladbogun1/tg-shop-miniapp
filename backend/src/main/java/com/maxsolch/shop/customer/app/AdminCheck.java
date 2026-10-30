package com.maxsolch.shop.customer.app;

/**
 * What the customer module asks about staff: is this Telegram user an active admin right now.
 * The port is declared here and implemented by {@code staff}, so the two modules do not depend on each other in a cycle
 * (staff signs admins in through customer's sessions; customer only needs this one yes/no).
 */
public interface AdminCheck {

    boolean isActive(long telegramUserId);
}
