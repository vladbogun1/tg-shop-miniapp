package com.maxsolch.shop.adminauth;

import com.maxsolch.shop.config.AppProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Keys of the admin sign-in, all from configuration:
 * <ul>
 *   <li>the AES-256 key of the TOTP secrets — {@code ADMIN_2FA_KEY}, or HKDF(JWT secret) when blank;</li>
 *   <li>the HMAC key of the pre-auth tokens — always HKDF(JWT secret, "admin-preauth"), i.e. a key
 *       that is NOT the access-token key: a pre-auth token can never pass as an access token.</li>
 * </ul>
 */
@Slf4j
@Component
public class AdminAuthKeys {

    private static final byte[] SALT = "tg-shop-v2/admin-auth".getBytes(StandardCharsets.US_ASCII);

    private final SecretCipher cipher;
    private final byte[] preAuthKey;
    private final byte[] markerKey;

    public AdminAuthKeys(AppProperties props) {
        byte[] jwtSecret = Base64.getDecoder().decode(props.getSecurity().getJwtSecret());
        this.preAuthKey = Hkdf.derive(jwtSecret, SALT, ascii("admin-preauth-jwt"), 32);
        this.markerKey = Hkdf.derive(jwtSecret, SALT, ascii("admin-emergency-reset"), 32);
        this.cipher = new SecretCipher(resolve2faKey(props.getSecurity().getAdmin2faKey(), jwtSecret));
    }

    static byte[] resolve2faKey(String configured, byte[] jwtSecret) {
        if (configured != null && !configured.isBlank()) {
            byte[] key;
            try {
                key = Base64.getDecoder().decode(configured.trim());
            } catch (IllegalArgumentException e) {
                throw new IllegalStateException("ADMIN_2FA_KEY is not valid base64 (openssl rand -base64 32)", e);
            }
            if (key.length != 32) {
                throw new IllegalStateException("ADMIN_2FA_KEY must decode to 32 bytes, got " + key.length
                        + " (openssl rand -base64 32)");
            }
            return key;
        }
        log.warn("SECURITY: ADMIN_2FA_KEY не задан — ключ шифрования секретов 2FA выведен из JWT_SECRET (HKDF). "
                + "Задайте отдельный ключ (openssl rand -base64 32) ДО того, как админы настроят 2FA: "
                + "смена ключа потом сделает сохранённые секреты нечитаемыми.");
        return Hkdf.derive(jwtSecret, SALT, ascii("admin-totp-secret-aes"), 32);
    }

    public SecretCipher cipher() {
        return cipher;
    }

    public byte[] preAuthKey() {
        return preAuthKey.clone();
    }

    /**
     * Keyed fingerprint of a value (hex HMAC-SHA256 under a key derived for this purpose): lets the
     * emergency reset remember "done for this ADMIN_PASSWORD" without storing anything a database
     * reader could brute-force offline.
     */
    public String fingerprint(String value) {
        try {
            javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(new javax.crypto.spec.SecretKeySpec(markerKey, "HmacSHA256"));
            return java.util.HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] ascii(String s) {
        return s.getBytes(StandardCharsets.US_ASCII);
    }
}
