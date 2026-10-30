package com.maxsolch.shop.staff.app;

/** Who is knocking: client IP (as resolved by {@code platform.web.ClientIp}) and the User-Agent. */
public record ClientInfo(String ip, String userAgent) {
}
