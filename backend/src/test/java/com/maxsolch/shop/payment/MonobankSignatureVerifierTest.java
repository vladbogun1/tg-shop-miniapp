package com.maxsolch.shop.payment;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Base64;
import java.util.Deque;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;

/** X-Sign of a monobank webhook: ECDSA P-256 / SHA-256 over the raw body, key = base64 of a PEM. */
class MonobankSignatureVerifierTest {

    private static final byte[] BODY =
            "{\"invoiceId\":\"p2_9ZgpZVsl3\",\"status\":\"success\",\"amount\":4200}".getBytes(StandardCharsets.UTF_8);

    private static KeyPair keyPair() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("EC");
        gen.initialize(new ECGenParameterSpec("secp256r1"));
        return gen.generateKeyPair();
    }

    /** What {@code GET /api/merchant/pubkey} returns in {@code key}: base64 of a PEM "PUBLIC KEY". */
    private static String apiKey(KeyPair kp) {
        String pem = "-----BEGIN PUBLIC KEY-----\n"
                + Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.US_ASCII))
                .encodeToString(kp.getPublic().getEncoded())
                + "\n-----END PUBLIC KEY-----\n";
        return Base64.getEncoder().encodeToString(pem.getBytes(StandardCharsets.US_ASCII));
    }

    private static String sign(PrivateKey key, byte[] body) throws Exception {
        Signature sig = Signature.getInstance("SHA256withECDSA");
        sig.initSign(key);
        sig.update(body);
        return Base64.getEncoder().encodeToString(sig.sign());
    }

    /** Hands out the given keys one per fetch (the last one repeats), counting the fetches. */
    private static final class Keys implements Supplier<String> {
        final Deque<String> queue = new ArrayDeque<>();
        final AtomicInteger fetches = new AtomicInteger();
        String last;

        Keys(String... keys) {
            for (String k : keys) {
                queue.add(k);
            }
        }

        @Override
        public String get() {
            fetches.incrementAndGet();
            if (!queue.isEmpty()) {
                last = queue.poll();
            }
            return last;
        }
    }

    @Test
    void validSignature_verifies() throws Exception {
        KeyPair kp = keyPair();
        MonobankSignatureVerifier verifier = new MonobankSignatureVerifier(new Keys(apiKey(kp)));

        assertThat(verifier.verify(BODY, sign(kp.getPrivate(), BODY))).isTrue();
    }

    @Test
    void tamperedBody_fails() throws Exception {
        KeyPair kp = keyPair();
        MonobankSignatureVerifier verifier = new MonobankSignatureVerifier(new Keys(apiKey(kp)));
        String xSign = sign(kp.getPrivate(), BODY);

        byte[] tampered = new String(BODY, StandardCharsets.UTF_8).replace("4200", "1")
                .getBytes(StandardCharsets.UTF_8);

        assertThat(verifier.verify(tampered, xSign)).isFalse();
    }

    @Test
    void missingOrGarbageHeader_fails() throws Exception {
        KeyPair kp = keyPair();
        MonobankSignatureVerifier verifier = new MonobankSignatureVerifier(new Keys(apiKey(kp)));

        assertThat(verifier.verify(BODY, null)).isFalse();
        assertThat(verifier.verify(BODY, " ")).isFalse();
        assertThat(verifier.verify(BODY, "not base64 !!")).isFalse();
        assertThat(verifier.verify(null, sign(kp.getPrivate(), BODY))).isFalse();
    }

    @Test
    void signatureByAnotherKey_fails() throws Exception {
        KeyPair ours = keyPair();
        KeyPair attacker = keyPair();
        MonobankSignatureVerifier verifier = new MonobankSignatureVerifier(new Keys(apiKey(ours)));

        assertThat(verifier.verify(BODY, sign(attacker.getPrivate(), BODY))).isFalse();
    }

    @Test
    void keyRotation_refetchesTheKeyOnceAndVerifies() throws Exception {
        KeyPair oldKey = keyPair();
        KeyPair newKey = keyPair();
        Keys keys = new Keys(apiKey(oldKey), apiKey(newKey));
        MonobankSignatureVerifier verifier = new MonobankSignatureVerifier(keys);
        // the old key is cached by a first webhook...
        assertThat(verifier.verify(BODY, sign(oldKey.getPrivate(), BODY))).isTrue();
        assertThat(keys.fetches).hasValue(1);
        // ...a while ago (the re-fetch is rate-limited to once a minute)
        ageLastFetch(verifier);

        // monobank rotated its key: the cached one fails, the fresh one verifies
        assertThat(verifier.verify(BODY, sign(newKey.getPrivate(), BODY))).isTrue();
        assertThat(keys.fetches).hasValue(2);
        // and stays cached
        assertThat(verifier.verify(BODY, sign(newKey.getPrivate(), BODY))).isTrue();
        assertThat(keys.fetches).hasValue(2);
    }

    @Test
    void forgedRequests_doNotHammerThePubkeyApi() throws Exception {
        KeyPair ours = keyPair();
        KeyPair attacker = keyPair();
        Keys keys = new Keys(apiKey(ours));
        MonobankSignatureVerifier verifier = new MonobankSignatureVerifier(keys);

        for (int i = 0; i < 5; i++) {
            assertThat(verifier.verify(BODY, sign(attacker.getPrivate(), BODY))).isFalse();
        }

        assertThat(keys.fetches).hasValue(1);
    }

    @Test
    void unreachableKeyApi_failsClosed() throws Exception {
        KeyPair kp = keyPair();
        MonobankSignatureVerifier verifier = new MonobankSignatureVerifier(() -> {
            throw new MonobankClient.MonobankException(0, null, "down");
        });

        assertThat(verifier.verify(BODY, sign(kp.getPrivate(), BODY))).isFalse();
    }

    private static void ageLastFetch(MonobankSignatureVerifier verifier) throws Exception {
        Field f = MonobankSignatureVerifier.class.getDeclaredField("lastFetch");
        f.setAccessible(true);
        f.set(verifier, Instant.now().minusSeconds(120));
    }
}
