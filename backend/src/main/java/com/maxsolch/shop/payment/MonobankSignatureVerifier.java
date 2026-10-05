package com.maxsolch.shop.payment;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.function.Supplier;

/**
 * Checks the {@code X-Sign} header of a monobank webhook: base64 of an ECDSA (SHA-256) signature
 * over the raw request body, made with the key from {@code GET /api/merchant/pubkey}.
 *
 * <p>The key is cached; when a signature does not verify, the key is fetched again once (monobank
 * may rotate it) — but at most once a minute, so forged requests cannot make us hammer the API.
 * Same algorithm as the official Java example in the monobank skill.
 */
@Slf4j
@Component
public class MonobankSignatureVerifier {

    private static final Duration REFETCH_MIN_INTERVAL = Duration.ofMinutes(1);

    private final Supplier<String> keySource;
    private volatile PublicKey key;
    private volatile Instant lastFetch = Instant.EPOCH;

    @org.springframework.beans.factory.annotation.Autowired
    public MonobankSignatureVerifier(MonobankClient client) {
        this(client::pubkey);
    }

    MonobankSignatureVerifier(Supplier<String> keySource) {
        this.keySource = keySource;
    }

    public boolean verify(byte[] body, String xSign) {
        if (xSign == null || xSign.isBlank() || body == null) {
            return false;
        }
        byte[] signature;
        try {
            signature = Base64.getDecoder().decode(xSign.trim());
        } catch (IllegalArgumentException e) {
            return false;
        }
        PublicKey current = key;
        if (current == null) {
            current = refetch(true);
        }
        if (current != null && check(current, body, signature)) {
            return true;
        }
        PublicKey fresh = refetch(false);
        return fresh != null && fresh != current && check(fresh, body, signature);
    }

    private synchronized PublicKey refetch(boolean force) {
        Instant now = Instant.now();
        if (!force && lastFetch.plus(REFETCH_MIN_INTERVAL).isAfter(now)) {
            return key;
        }
        lastFetch = now;
        try {
            key = parse(keySource.get());
        } catch (Exception e) {
            log.warn("monobank pubkey fetch failed: {}", e.getMessage());
        }
        return key;
    }

    /** {@code key} from the API: base64 of a PEM "PUBLIC KEY" (X.509 EC key). */
    static PublicKey parse(String keyB64) throws Exception {
        String pem = new String(Base64.getDecoder().decode(keyB64.trim()), StandardCharsets.UTF_8);
        String b64 = pem.replace("-----BEGIN PUBLIC KEY-----", "")
                .replace("-----END PUBLIC KEY-----", "")
                .replaceAll("\\s", "");
        return KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(b64)));
    }

    private static boolean check(PublicKey key, byte[] body, byte[] signature) {
        try {
            Signature sig = Signature.getInstance("SHA256withECDSA");
            sig.initVerify(key);
            sig.update(body);
            return sig.verify(signature);
        } catch (Exception e) {
            return false;
        }
    }
}
