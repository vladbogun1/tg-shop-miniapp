package com.maxsolch.shop.adminauth;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * AES-256-GCM for the TOTP secrets at rest ({@code admin_users.totp_secret_enc}).
 *
 * <p>Stored form: {@code v1:} + base64(12-byte random IV ‖ ciphertext ‖ 16-byte tag). The admin's
 * id is the associated data, so a ciphertext copied into another admin's row does not decrypt:
 * a database-only attacker can neither read a secret nor move one between accounts.
 */
public final class SecretCipher {

    private static final String PREFIX = "v1:";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final SecretKeySpec key;

    public SecretCipher(byte[] key32) {
        if (key32 == null || key32.length != 32) {
            throw new IllegalArgumentException("AES-256 key must be 32 bytes");
        }
        this.key = new SecretKeySpec(key32, "AES");
    }

    public String encrypt(byte[] plain, long adminId) {
        try {
            byte[] iv = new byte[IV_BYTES];
            RANDOM.nextBytes(iv);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            c.updateAAD(aad(adminId));
            byte[] ct = c.doFinal(plain);
            return PREFIX + Base64.getEncoder().encodeToString(
                    ByteBuffer.allocate(iv.length + ct.length).put(iv).put(ct).array());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("AES-GCM encryption failed", e);
        }
    }

    /** @throws IllegalStateException when the value was tampered with, belongs to another admin or another key */
    public byte[] decrypt(String stored, long adminId) {
        if (stored == null || !stored.startsWith(PREFIX)) {
            throw new IllegalStateException("unknown secret format");
        }
        try {
            byte[] all = Base64.getDecoder().decode(stored.substring(PREFIX.length()));
            if (all.length <= IV_BYTES) {
                throw new IllegalStateException("secret too short");
            }
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, all, 0, IV_BYTES));
            c.updateAAD(aad(adminId));
            return c.doFinal(all, IV_BYTES, all.length - IV_BYTES);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IllegalStateException("cannot decrypt the 2FA secret (wrong ADMIN_2FA_KEY?)", e);
        }
    }

    private static byte[] aad(long adminId) {
        return ("admin-totp:" + adminId).getBytes(StandardCharsets.US_ASCII);
    }
}
