package com.maxsolch.shop.staff.api;

import com.maxsolch.shop.platform.web.ClientIp;
import com.maxsolch.shop.staff.app.ClientInfo;
import jakarta.servlet.http.HttpServletRequest;

/** Reads who is knocking (IP and User-Agent) from the HTTP request, for the scenarios that only know {@link ClientInfo}. */
final class RequestClient {

    private RequestClient() {
    }

    static ClientInfo of(HttpServletRequest request) {
        String ua = request.getHeader("User-Agent");
        if (ua != null && ua.length() > 255) {
            ua = ua.substring(0, 255);
        }
        return new ClientInfo(ClientIp.of(request), ua);
    }
}
