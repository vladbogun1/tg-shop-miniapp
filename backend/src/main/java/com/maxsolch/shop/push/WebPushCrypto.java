package com.maxsolch.shop.push;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.util.Arrays;
import java.util.Base64;

/**
 * Web Push message encryption (RFC 8291, {@code aes128gcm} of RFC 8188) and VAPID tokens
 * (RFC 8292) on plain JDK crypto — P-256 ECDH, HKDF-SHA-256, AES-128-GCM, ES256. No third-party
 * library: the ones on Maven Central are unmaintained and drag in BouncyCastle + an async HTTP
 * client for what is ~150 lines here.
 */
public final class WebPushCrypto {

    /** Single record: the whole payload must fit, push services accept 4096 bytes of body. */
    static final int RECORD_SIZE = 4096;
    /** Leaves room for the 86-byte header, the 16-byte tag and the delimiter. */
    public static final int MAX_PAYLOAD = 3000;

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder B64URL = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64URL_DEC = Base64.getUrlDecoder();
    private static final ECParameterSpec P256 = p256();

    private WebPushCrypto() {
    }

    // ---- keys -------------------------------------------------------------------------------

    public static ECPublicKey publicKey(byte[] uncompressed) throws GeneralSecurityException {
        if (uncompressed.length != 65 || uncompressed[0] != 0x04) {
            throw new GeneralSecurityException("expected a 65-byte uncompressed P-256 point");
        }
        BigInteger x = new BigInteger(1, Arrays.copyOfRange(uncompressed, 1, 33));
        BigInteger y = new BigInteger(1, Arrays.copyOfRange(uncompressed, 33, 65));
        return (ECPublicKey) KeyFactory.getInstance("EC")
                .generatePublic(new ECPublicKeySpec(new ECPoint(x, y), P256));
    }

    public static ECPrivateKey privateKey(byte[] scalar) throws GeneralSecurityException {
        if (scalar.length != 32) {
            throw new GeneralSecurityException("expected a 32-byte P-256 private key");
        }
        return (ECPrivateKey) KeyFactory.getInstance("EC")
                .generatePrivate(new ECPrivateKeySpec(new BigInteger(1, scalar), P256));
    }

    /** 0x04 || X || Y, both coordinates left-padded to 32 bytes. */
    public static byte[] encode(ECPublicKey key) {
        byte[] out = new byte[65];
        out[0] = 0x04;
        copyUnsigned(key.getW().getAffineX(), out, 1);
        copyUnsigned(key.getW().getAffineY(), out, 33);
        return out;
    }

    public static KeyPair generateKeyPair() throws GeneralSecurityException {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("EC");
        gen.initialize(new ECGenParameterSpec("secp256r1"), RANDOM);
        return gen.generateKeyPair();
    }

    /** Raw 32-byte scalar of a private key (what VAPID_PRIVATE_KEY holds). */
    public static byte[] encode(ECPrivateKey key) {
        byte[] out = new byte[32];
        copyUnsigned(key.getS(), out, 0);
        return out;
    }

    /** Does the private key belong to the public one? (A mismatched pair = every push 403s.) */
    public static boolean matches(ECPrivateKey priv, ECPublicKey pub) {
        try {
            byte[] data = "vapid-pair-check".getBytes(StandardCharsets.US_ASCII);
            Signature s = Signature.getInstance("SHA256withECDSAinP1363Format");
            s.initSign(priv);
            s.update(data);
            byte[] sig = s.sign();
            Signature v = Signature.getInstance("SHA256withECDSAinP1363Format");
            v.initVerify(pub);
            v.update(data);
            return v.verify(sig);
        } catch (GeneralSecurityException e) {
            return false;
        }
    }

    public static byte[] b64url(String s) {
        return B64URL_DEC.decode(s.trim().replace('+', '-').replace('/', '_').replace("=", ""));
    }

    public static String b64url(byte[] b) {
        return B64URL.encodeToString(b);
    }

    // ---- RFC 8291 ---------------------------------------------------------------------------

    /**
     * Encrypts {@code payload} for one subscription.
     *
     * @param uaPublic   the browser's {@code p256dh} key (65 bytes)
     * @param authSecret the browser's {@code auth} secret (16 bytes)
     * @return the request body: {@code salt || rs || idlen || keyid || ciphertext}
     */
    public static byte[] encrypt(byte[] payload, byte[] uaPublic, byte[] authSecret) throws GeneralSecurityException {
        byte[] salt = new byte[16];
        RANDOM.nextBytes(salt);
        return encrypt(payload, uaPublic, authSecret, generateKeyPair(), salt);
    }

    /** Deterministic variant (fixed ephemeral key + salt) — for tests. */
    static byte[] encrypt(byte[] payload, byte[] uaPublic, byte[] authSecret, KeyPair asKeys, byte[] salt)
            throws GeneralSecurityException {
        if (payload.length > MAX_PAYLOAD) {
            throw new GeneralSecurityException("push payload too large: " + payload.length);
        }
        ECPublicKey ua = publicKey(uaPublic);
        byte[] asPublic = encode((ECPublicKey) asKeys.getPublic());

        KeyAgreement ka = KeyAgreement.getInstance("ECDH");
        ka.init(asKeys.getPrivate());
        ka.doPhase(ua, true);
        byte[] ecdhSecret = ka.generateSecret();

        byte[][] keyAndNonce = deriveKeyAndNonce(ecdhSecret, authSecret, uaPublic, asPublic, salt);

        byte[] plain = Arrays.copyOf(payload, payload.length + 1);
        plain[payload.length] = 0x02; // last-record delimiter, no padding
        Cipher gcm = Cipher.getInstance("AES/GCM/NoPadding");
        gcm.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(keyAndNonce[0], "AES"), new GCMParameterSpec(128, keyAndNonce[1]));
        byte[] cipher = gcm.doFinal(plain);

        ByteBuffer body = ByteBuffer.allocate(16 + 4 + 1 + asPublic.length + cipher.length);
        body.put(salt).putInt(RECORD_SIZE).put((byte) asPublic.length).put(asPublic).put(cipher);
        return body.array();
    }

    /** {CEK (16 bytes), NONCE (12 bytes)} — shared by the sender and (in tests) the receiver. */
    static byte[][] deriveKeyAndNonce(byte[] ecdhSecret, byte[] authSecret, byte[] uaPublic, byte[] asPublic, byte[] salt)
            throws GeneralSecurityException {
        byte[] prkKey = hmac(authSecret, ecdhSecret);
        byte[] keyInfo = concat("WebPush: info\0".getBytes(StandardCharsets.US_ASCII), uaPublic, asPublic, new byte[]{1});
        byte[] ikm = hmac(prkKey, keyInfo);
        byte[] prk = hmac(salt, ikm);
        byte[] cek = Arrays.copyOf(hmac(prk, concat("Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII), new byte[]{1})), 16);
        byte[] nonce = Arrays.copyOf(hmac(prk, concat("Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII), new byte[]{1})), 12);
        return new byte[][]{cek, nonce};
    }

    // ---- RFC 8292 ---------------------------------------------------------------------------

    /**
     * {@code Authorization} header value: {@code vapid t=<ES256 JWT>, k=<public key>}.
     *
     * @param audience origin of the push endpoint, e.g. {@code https://fcm.googleapis.com}
     * @param expiresAtEpochSeconds at most 24 h ahead (push services reject longer)
     */
    public static String vapidAuthorization(String audience, String subject, long expiresAtEpochSeconds,
                                            PrivateKey vapidPrivate, byte[] vapidPublic) throws GeneralSecurityException {
        String header = b64url("{\"typ\":\"JWT\",\"alg\":\"ES256\"}".getBytes(StandardCharsets.UTF_8));
        String claims = b64url(("{\"aud\":\"" + json(audience) + "\",\"exp\":" + expiresAtEpochSeconds
                + ",\"sub\":\"" + json(subject) + "\"}").getBytes(StandardCharsets.UTF_8));
        String signingInput = header + "." + claims;
        Signature es256 = Signature.getInstance("SHA256withECDSAinP1363Format");
        es256.initSign(vapidPrivate);
        es256.update(signingInput.getBytes(StandardCharsets.US_ASCII));
        String jwt = signingInput + "." + b64url(es256.sign());
        return "vapid t=" + jwt + ", k=" + b64url(vapidPublic);
    }

    // ---- helpers ----------------------------------------------------------------------------

    static byte[] hmac(byte[] key, byte[] data) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data);
    }

    static byte[] concat(byte[]... parts) {
        int len = 0;
        for (byte[] p : parts) {
            len += p.length;
        }
        byte[] out = new byte[len];
        int pos = 0;
        for (byte[] p : parts) {
            System.arraycopy(p, 0, out, pos, p.length);
            pos += p.length;
        }
        return out;
    }

    private static void copyUnsigned(BigInteger v, byte[] out, int offset) {
        byte[] b = v.toByteArray();
        int start = b.length > 32 ? b.length - 32 : 0;
        int len = b.length - start;
        System.arraycopy(b, start, out, offset + 32 - len, len);
    }

    private static String json(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static ECParameterSpec p256() {
        try {
            AlgorithmParameters params = AlgorithmParameters.getInstance("EC");
            params.init(new ECGenParameterSpec("secp256r1"));
            return params.getParameterSpec(ECParameterSpec.class);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("P-256 is not available in this JVM", e);
        }
    }
}
