package com.maxsolch.shop.adminauth;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.OptionalLong;

/**
 * TOTP (RFC 6238) on top of HOTP (RFC 4226): HMAC-SHA1, 6 digits, 30-second steps — the profile
 * Google Authenticator, 1Password, Authy and every other app support without extra parameters.
 *
 * <p>Own ~80 lines over the JDK's {@link Mac} instead of a library: the popular Java TOTP packages
 * (dev.samstevens.totp, aerogear-otp, GoogleAuth) are unmaintained for years and drag in QR/codec
 * dependencies we do not need (the QR is drawn by the admin panel). The algorithm is small and
 * fully specified; {@code TotpTest} pins it to the RFC 6238 Appendix B and RFC 4226 Appendix D
 * test vectors.
 *
 * <p>Codes are compared in constant time; verification checks the current step ±{@link #WINDOW}
 * and returns WHICH step matched, so the caller can refuse a code whose step was already used
 * (replay protection lives in {@code AdminAuthService}).
 */
public final class Totp {

    public static final int DIGITS = 6;
    public static final int PERIOD_SECONDS = 30;
    /** Accepted clock drift in steps either way (±30 s). */
    public static final int WINDOW = 1;
    /** 160-bit secret, the size RFC 4226 recommends for HMAC-SHA1. */
    public static final int SECRET_BYTES = 20;

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int[] POW10 = {1, 10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000};

    private Totp() {
    }

    public static byte[] newSecret() {
        byte[] secret = new byte[SECRET_BYTES];
        RANDOM.nextBytes(secret);
        return secret;
    }

    /** Time step number for a Unix time in seconds. */
    public static long stepAt(long epochSeconds) {
        return Math.floorDiv(epochSeconds, PERIOD_SECONDS);
    }

    /** HOTP value for a counter, {@code digits} long, zero-padded. */
    public static String hotp(byte[] secret, long counter, int digits) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(secret, "HmacSHA1"));
            byte[] msg = new byte[8];
            for (int i = 7; i >= 0; i--) {
                msg[i] = (byte) (counter & 0xFF);
                counter >>>= 8;
            }
            byte[] h = mac.doFinal(msg);
            int offset = h[h.length - 1] & 0x0F;
            int binary = ((h[offset] & 0x7F) << 24)
                    | ((h[offset + 1] & 0xFF) << 16)
                    | ((h[offset + 2] & 0xFF) << 8)
                    | (h[offset + 3] & 0xFF);
            int otp = binary % POW10[digits];
            StringBuilder s = new StringBuilder(Integer.toString(otp));
            while (s.length() < digits) {
                s.insert(0, '0');
            }
            return s.toString();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA1 unavailable", e);
        }
    }

    /** The 6-digit code for a given step. */
    public static String codeAt(byte[] secret, long step) {
        return hotp(secret, step, DIGITS);
    }

    /**
     * Checks {@code code} against the steps around {@code epochSeconds}.
     *
     * @return the matching step, or empty when the code is wrong / malformed
     */
    public static OptionalLong verify(byte[] secret, String code, long epochSeconds) {
        String normalized = normalize(code);
        if (normalized == null) {
            return OptionalLong.empty();
        }
        byte[] given = normalized.getBytes(StandardCharsets.US_ASCII);
        long now = stepAt(epochSeconds);
        long matched = Long.MIN_VALUE;
        // Every candidate is computed and compared, so the timing does not reveal which one hit.
        for (long step = now - WINDOW; step <= now + WINDOW; step++) {
            byte[] expected = codeAt(secret, step).getBytes(StandardCharsets.US_ASCII);
            if (MessageDigest.isEqual(expected, given) && matched == Long.MIN_VALUE) {
                matched = step;
            }
        }
        return matched == Long.MIN_VALUE ? OptionalLong.empty() : OptionalLong.of(matched);
    }

    /** "123 456" / " 123456 " → "123456"; anything that is not exactly six digits → null. */
    static String normalize(String code) {
        if (code == null) {
            return null;
        }
        String s = code.replace(" ", "").replace("-", "").trim();
        if (s.length() != DIGITS) {
            return null;
        }
        for (int i = 0; i < s.length(); i++) {
            if (s.charAt(i) < '0' || s.charAt(i) > '9') {
                return null;
            }
        }
        return s;
    }

    /**
     * {@code otpauth://totp/Issuer:account?secret=…&issuer=…&algorithm=SHA1&digits=6&period=30} —
     * what the QR code carries and what a phone opens straight in its authenticator app.
     */
    public static String otpauthUri(String issuer, String account, String base32Secret) {
        String label = enc(issuer) + ":" + enc(account);
        return "otpauth://totp/" + label
                + "?secret=" + base32Secret
                + "&issuer=" + enc(issuer)
                + "&algorithm=SHA1&digits=" + DIGITS + "&period=" + PERIOD_SECONDS;
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
