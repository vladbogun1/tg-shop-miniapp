package com.maxsolch.shop.push;

import org.junit.jupiter.api.Test;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.util.Arrays;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * RFC 8291 encryption checked by decrypting as the browser would (with the subscription's own
 * private key), and the VAPID JWT checked against the public key — no network involved.
 */
class WebPushCryptoTest {

    @Test
    void encryptedPayloadDecryptsWithTheSubscriptionKeys() throws Exception {
        KeyPair ua = WebPushCrypto.generateKeyPair();
        byte[] uaPublic = WebPushCrypto.encode((ECPublicKey) ua.getPublic());
        byte[] auth = new byte[16];
        new java.security.SecureRandom().nextBytes(auth);
        byte[] payload = "{\"title\":\"Новый заказ #9a6feb7d\",\"body\":\"1 300 ₴\"}".getBytes(StandardCharsets.UTF_8);

        byte[] body = WebPushCrypto.encrypt(payload, uaPublic, auth);

        // Header: salt(16) | rs(4) | idlen(1) | keyid(65)
        ByteBuffer buf = ByteBuffer.wrap(body);
        byte[] salt = new byte[16];
        buf.get(salt);
        assertThat(buf.getInt()).isEqualTo(4096);
        int idLen = buf.get() & 0xff;
        assertThat(idLen).isEqualTo(65);
        byte[] asPublic = new byte[idLen];
        buf.get(asPublic);
        byte[] cipher = new byte[buf.remaining()];
        buf.get(cipher);

        // Receiver side: ECDH with our private key and the sender's ephemeral public key.
        KeyAgreement ka = KeyAgreement.getInstance("ECDH");
        ka.init(ua.getPrivate());
        ka.doPhase(WebPushCrypto.publicKey(asPublic), true);
        byte[][] keyNonce = WebPushCrypto.deriveKeyAndNonce(ka.generateSecret(), auth, uaPublic, asPublic, salt);
        Cipher gcm = Cipher.getInstance("AES/GCM/NoPadding");
        gcm.init(Cipher.DECRYPT_MODE, new SecretKeySpec(keyNonce[0], "AES"), new GCMParameterSpec(128, keyNonce[1]));
        byte[] plain = gcm.doFinal(cipher);

        assertThat(plain[plain.length - 1]).isEqualTo((byte) 0x02); // last-record delimiter
        assertThat(Arrays.copyOf(plain, plain.length - 1)).isEqualTo(payload);
    }

    @Test
    void wrongAuthSecretCannotDecrypt() throws Exception {
        KeyPair ua = WebPushCrypto.generateKeyPair();
        byte[] uaPublic = WebPushCrypto.encode((ECPublicKey) ua.getPublic());
        byte[] auth = new byte[16];
        byte[] body = WebPushCrypto.encrypt("hi".getBytes(StandardCharsets.UTF_8), uaPublic, auth);
        byte[] salt = Arrays.copyOfRange(body, 0, 16);
        byte[] asPublic = Arrays.copyOfRange(body, 21, 86);
        KeyAgreement ka = KeyAgreement.getInstance("ECDH");
        ka.init(ua.getPrivate());
        ka.doPhase(WebPushCrypto.publicKey(asPublic), true);
        byte[] wrongAuth = new byte[16];
        wrongAuth[0] = 1;
        byte[][] keyNonce = WebPushCrypto.deriveKeyAndNonce(ka.generateSecret(), wrongAuth, uaPublic, asPublic, salt);
        Cipher gcm = Cipher.getInstance("AES/GCM/NoPadding");
        gcm.init(Cipher.DECRYPT_MODE, new SecretKeySpec(keyNonce[0], "AES"), new GCMParameterSpec(128, keyNonce[1]));
        assertThatThrownBy(() -> gcm.doFinal(Arrays.copyOfRange(body, 86, body.length)))
                .isInstanceOf(javax.crypto.AEADBadTagException.class);
    }

    @Test
    void vapidTokenIsAnEs256JwtVerifiableWithThePublicKey() throws Exception {
        KeyPair vapid = WebPushCrypto.generateKeyPair();
        byte[] pub = WebPushCrypto.encode((ECPublicKey) vapid.getPublic());

        String header = WebPushCrypto.vapidAuthorization("https://fcm.googleapis.com", "mailto:owner@example.com",
                1_900_000_000L, vapid.getPrivate(), pub);

        assertThat(header).startsWith("vapid t=").contains(", k=" + WebPushCrypto.b64url(pub));
        String jwt = header.substring("vapid t=".length(), header.indexOf(", k="));
        String[] parts = jwt.split("\\.");
        assertThat(parts).hasSize(3);
        String claims = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
        assertThat(claims).isEqualTo("{\"aud\":\"https://fcm.googleapis.com\",\"exp\":1900000000,\"sub\":\"mailto:owner@example.com\"}");
        byte[] sig = Base64.getUrlDecoder().decode(parts[2]);
        assertThat(sig).hasSize(64); // raw r||s, not DER
        Signature v = Signature.getInstance("SHA256withECDSAinP1363Format");
        v.initVerify(vapid.getPublic());
        v.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
        assertThat(v.verify(sig)).isTrue();
    }

    @Test
    void rawKeysRoundTripAndPairCheck() throws Exception {
        KeyPair a = WebPushCrypto.generateKeyPair();
        KeyPair b = WebPushCrypto.generateKeyPair();
        byte[] pub = WebPushCrypto.encode((ECPublicKey) a.getPublic());
        byte[] priv = WebPushCrypto.encode((ECPrivateKey) a.getPrivate());
        assertThat(pub).hasSize(65);
        assertThat(priv).hasSize(32);

        ECPublicKey pub2 = WebPushCrypto.publicKey(WebPushCrypto.b64url(WebPushCrypto.b64url(pub)));
        ECPrivateKey priv2 = WebPushCrypto.privateKey(WebPushCrypto.b64url(WebPushCrypto.b64url(priv)));
        assertThat(WebPushCrypto.matches(priv2, pub2)).isTrue();
        assertThat(WebPushCrypto.matches((ECPrivateKey) b.getPrivate(), pub2)).isFalse();
        assertThatThrownBy(() -> WebPushCrypto.publicKey(new byte[64])).isInstanceOf(java.security.GeneralSecurityException.class);
    }

    @Test
    void tooLargePayloadIsRefused() throws Exception {
        KeyPair ua = WebPushCrypto.generateKeyPair();
        byte[] uaPublic = WebPushCrypto.encode((ECPublicKey) ua.getPublic());
        assertThatThrownBy(() -> WebPushCrypto.encrypt(new byte[WebPushCrypto.MAX_PAYLOAD + 1], uaPublic, new byte[16]))
                .isInstanceOf(java.security.GeneralSecurityException.class);
    }
}
