package com.maxsolch.shop.customer.app;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

/** Reading and comparing the site's login/refresh tokens (see {@link WebAuthService} for the flow). */
final class WebTokens {

    private WebTokens() {
    }

    /** Session id encoded in a refresh token, or null if it is not one of ours. */
    static byte[] sessionIdOf(String refreshToken) {
        if (refreshToken == null) {
            return null;
        }
        int dot = refreshToken.indexOf('.');
        if (dot <= 0 || dot == refreshToken.length() - 1 || refreshToken.length() > 200) {
            return null;
        }
        try {
            byte[] id = Base64.getUrlDecoder().decode(refreshToken.substring(0, dot));
            return id.length == 16 ? id : null;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) {
            return false;
        }
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.US_ASCII), b.getBytes(StandardCharsets.US_ASCII));
    }
}
