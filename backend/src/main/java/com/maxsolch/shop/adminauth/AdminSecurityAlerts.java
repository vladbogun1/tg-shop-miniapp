package com.maxsolch.shop.adminauth;

import java.time.Instant;

/**
 * Messages to the admin personally (the shop bot, by telegram_user_id) about their own account.
 * Implemented by {@code tg.AdminSecurityNotifier}; best-effort — never blocks or fails a sign-in.
 */
public interface AdminSecurityAlerts {

    /** A finished sign-in from a device this admin has not signed in from before. */
    void newDeviceLogin(long adminId, LoginMethod method, String place, String device, String ip, Instant at);

    /** The account was locked after too many wrong passwords / codes. */
    void accountLocked(long adminId, String place, String device, String ip, Instant until);
}
