package com.maxsolch.shop.customer.app;

import org.springframework.lang.Nullable;

/**
 * What the admin users list is narrowed to. All parts combine (AND).
 *
 * @param q           search text (name, @username, Telegram id), null = no search
 * @param blockedOnly only those who blocked the bot
 * @param premiumOnly only Telegram Premium users ({@code users.is_premium}, refreshed at every sign-in)
 * @param hasOrders   true = at least one order of any status (as in the «С заказами» broadcast audience and the
 *                    «Заказы» column), false = none, null = either
 */
public record UserListFilter(@Nullable String q, boolean blockedOnly, boolean premiumOnly, @Nullable Boolean hasOrders) {

    public static UserListFilter of(@Nullable String q, boolean blockedOnly) {
        return new UserListFilter(q, blockedOnly, false, null);
    }
}
