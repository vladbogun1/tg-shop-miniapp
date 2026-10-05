package com.maxsolch.shop.adminauth;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.security.GeneralSecurityException;

/**
 * HKDF-SHA256 (RFC 5869): derives independent keys from one secret, so the JWT secret can back
 * the pre-auth token key and (when {@code ADMIN_2FA_KEY} is not set) the 2FA secret key without any
 * of them being usable as another. Pinned to the RFC's test vectors in {@code HkdfTest}.
 */
public final class Hkdf {

    private Hkdf() {
    }

    public static byte[] derive(byte[] ikm, byte[] salt, byte[] info, int length) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            byte[] s = salt == null || salt.length == 0 ? new byte[32] : salt;
            mac.init(new SecretKeySpec(s, "HmacSHA256"));
            byte[] prk = mac.doFinal(ikm);

            mac.init(new SecretKeySpec(prk, "HmacSHA256"));
            ByteArrayOutputStream okm = new ByteArrayOutputStream(length);
            byte[] t = new byte[0];
            int counter = 1;
            while (okm.size() < length) {
                mac.update(t);
                if (info != null) {
                    mac.update(info);
                }
                mac.update((byte) counter++);
                t = mac.doFinal();
                okm.write(t, 0, Math.min(t.length, length - okm.size()));
            }
            return okm.toByteArray();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }
}
