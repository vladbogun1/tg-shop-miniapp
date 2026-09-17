package com.maxsolch.shop.media;

import com.maxsolch.shop.config.AppProperties;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

/**
 * Issues and verifies short-lived signed links for private objects (chat attachments).
 *
 * <p>Chat attachments are the customer's transfer screenshots — they contain card numbers, names
 * and balances — and they used to sit in a world-readable bucket, reachable by anyone who ever saw
 * the URL, forever. They are now private, and the only way to read one is a link signed with this
 * key and valid for {@value #TTL_SECONDS} seconds.
 *
 * <p>A signature in the URL (rather than a bearer token) is what makes this work at all: an
 * {@code <img src>} cannot carry an Authorization header, so authorisation has to travel in the
 * link. The signature covers the object key and the expiry together, so neither can be changed.
 */
@Component
public class MediaSigner {

    /** Long enough to view a chat thread, short enough that a leaked link dies quickly. */
    public static final long TTL_SECONDS = 3600;

    /**
     * Expiries are snapped to this grid instead of being "now + TTL".
     *
     * <p>A fresh {@code exp} on every response meant a fresh URL on every response, so the browser
     * treated the same photo as a new resource each time the chat was opened or the history was
     * refetched, and re-downloaded it — which is a large part of why attachments took so long to
     * appear. Snapped, the link for a given object is byte-identical for half an hour and the
     * cached copy is reused. Validity stays between {@value #WINDOW_SECONDS} and
     * {@code 2 * WINDOW_SECONDS} seconds.
     */
    private static final long WINDOW_SECONDS = 1800;

    private static final String ALGORITHM = "HmacSHA256";

    private final byte[] key;

    public MediaSigner(AppProperties props) {
        // Derived from the JWT secret: one secret to configure, and rotating it invalidates
        // outstanding media links too, which is the behaviour you want.
        String secret = props.getSecurity().getJwtSecret();
        this.key = ("media:" + (secret == null ? "" : secret)).getBytes(StandardCharsets.UTF_8);
    }

    /** Relative URL (API-base-agnostic) that renders the object for the next hour. */
    public String signedUrl(String objectKey) {
        if (objectKey == null || objectKey.isBlank()) {
            return null;
        }
        long now = Instant.now().getEpochSecond();
        long expiresAt = (now / WINDOW_SECONDS + 2) * WINDOW_SECONDS;
        String signature = sign(objectKey, expiresAt);
        return "/api/media?key=" + urlEncode(objectKey)
                + "&exp=" + expiresAt
                + "&sig=" + signature;
    }

    public boolean isValid(String objectKey, long expiresAt, String signature) {
        if (objectKey == null || signature == null) {
            return false;
        }
        if (Instant.now().getEpochSecond() > expiresAt) {
            return false;
        }
        return constantTimeEquals(sign(objectKey, expiresAt), signature);
    }

    private String sign(String objectKey, long expiresAt) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(key, ALGORITHM));
            byte[] digest = mac.doFinal((objectKey + "|" + expiresAt).getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to sign media url", e);
        }
    }

    private static String urlEncode(String value) {
        return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null || a.length() != b.length()) {
            return false;
        }
        int result = 0;
        for (int i = 0; i < a.length(); i++) {
            result |= a.charAt(i) ^ b.charAt(i);
        }
        return result == 0;
    }
}
