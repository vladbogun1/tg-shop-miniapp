package com.maxsolch.shop.media;

import com.maxsolch.shop.config.AppProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Chat attachments are customers' transfer screenshots, so the signed link is the only thing
 * standing between them and anyone who can guess or reuse a URL.
 */
class MediaSignerTest {

    private MediaSigner signer;

    @BeforeEach
    void setUp() {
        AppProperties props = new AppProperties();
        props.getSecurity().setJwtSecret("c29tZS1yZWFsbHktbG9uZy1zZWNyZXQtdmFsdWUtaGVyZQ==");
        signer = new MediaSigner(props);
    }

    private static String param(String url, String name) {
        for (String pair : url.substring(url.indexOf('?') + 1).split("&")) {
            int eq = pair.indexOf('=');
            if (pair.substring(0, eq).equals(name)) {
                return URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    @Test
    void issuesALinkThatValidates() {
        String url = signer.signedUrl("chat/abc/receipt.jpg");

        assertThat(url).startsWith("/api/media?key=");
        long exp = Long.parseLong(param(url, "exp"));
        assertThat(signer.isValid("chat/abc/receipt.jpg", exp, param(url, "sig"))).isTrue();
    }

    @Test
    void signatureIsBoundToTheObjectKey() {
        String url = signer.signedUrl("chat/abc/receipt.jpg");
        long exp = Long.parseLong(param(url, "exp"));
        String sig = param(url, "sig");

        // Reusing someone else's signature for a different object must not work.
        assertThat(signer.isValid("chat/other/secret.jpg", exp, sig)).isFalse();
    }

    @Test
    void signatureIsBoundToTheExpiry() {
        String url = signer.signedUrl("chat/abc/receipt.jpg");
        String sig = param(url, "sig");
        long exp = Long.parseLong(param(url, "exp"));

        // Extending the lifetime by editing the URL must invalidate it.
        assertThat(signer.isValid("chat/abc/receipt.jpg", exp + 86_400, sig)).isFalse();
    }

    @Test
    void expiredLinksAreRejected() {
        long past = Instant.now().getEpochSecond() - 10;
        String url = signer.signedUrl("chat/abc/receipt.jpg");
        // Sign for a moment that has passed: even a correct signature is refused.
        assertThat(signer.isValid("chat/abc/receipt.jpg", past, param(url, "sig"))).isFalse();
    }

    @Test
    void garbageSignatureIsRejected() {
        assertThat(signer.isValid("chat/abc/receipt.jpg",
                Instant.now().getEpochSecond() + 60, "not-a-signature")).isFalse();
        assertThat(signer.isValid("chat/abc/receipt.jpg",
                Instant.now().getEpochSecond() + 60, null)).isFalse();
    }

    @Test
    void rotatingTheSecretInvalidatesOutstandingLinks() {
        String url = signer.signedUrl("chat/abc/receipt.jpg");
        long exp = Long.parseLong(param(url, "exp"));
        String sig = param(url, "sig");

        AppProperties rotated = new AppProperties();
        rotated.getSecurity().setJwtSecret("YS1jb21wbGV0ZWx5LWRpZmZlcmVudC1zZWNyZXQtdmFsdWU=");
        MediaSigner other = new MediaSigner(rotated);

        assertThat(other.isValid("chat/abc/receipt.jpg", exp, sig)).isFalse();
    }

    @Test
    void nullKeyProducesNoLink() {
        assertThat(signer.signedUrl(null)).isNull();
        assertThat(signer.signedUrl("  ")).isNull();
    }
}
