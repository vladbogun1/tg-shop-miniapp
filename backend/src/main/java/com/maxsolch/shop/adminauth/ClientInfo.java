package com.maxsolch.shop.adminauth;

import com.maxsolch.shop.common.ClientIp;
import jakarta.servlet.http.HttpServletRequest;

/** Who is knocking: client IP (as resolved by {@link ClientIp}) and the User-Agent. */
public record ClientInfo(String ip, String userAgent) {

    public static ClientInfo of(HttpServletRequest request) {
        String ua = request.getHeader("User-Agent");
        if (ua != null && ua.length() > 255) {
            ua = ua.substring(0, 255);
        }
        return new ClientInfo(ClientIp.of(request), ua);
    }
}
