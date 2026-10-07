package com.maxsolch.shop.payment;

import com.maxsolch.shop.config.AppProperties;
import org.junit.jupiter.api.Test;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

/** The signed link is the only thing between a receipt PDF (name, amount, card) and anyone with a URL. */
class ReceiptSignerTest {

    private static final Instant NOW = Instant.parse("2026-10-07T12:00:00Z");
    private static final String INV = "0f8b7c1e-1111-2222-3333-444455556666";

    private static ReceiptSigner signer(Instant at, String secret) {
        AppProperties props = new AppProperties();
        props.getSecurity().setJwtSecret(secret);
        return new ReceiptSigner(props, Clock.fixed(at, ZoneOffset.UTC));
    }

    private static ReceiptSigner signer(Instant at) {
        return signer(at, "c29tZS1yZWFsbHktbG9uZy1zZWNyZXQtdmFsdWUtaGVyZQ==");
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
    void issuedLinkValidates_andLivesAtLeastTenMinutes() {
        ReceiptSigner s = signer(NOW);
        String url = s.signedUrl(INV, ReceiptKind.FISCAL_SALE, "check-1");

        assertThat(url).startsWith("/api/receipts/file?inv=" + INV + "&kind=FISCAL_SALE&check=check-1&exp=");
        long exp = Long.parseLong(param(url, "exp"));
        assertThat(exp - NOW.getEpochSecond()).isGreaterThanOrEqualTo(ReceiptSigner.TTL_SECONDS);
        assertThat(s.isValid(INV, "FISCAL_SALE", "check-1", exp, param(url, "sig"))).isTrue();
    }

    @Test
    void bankLinkHasNoCheckParam_andValidatesWithNullCheck() {
        ReceiptSigner s = signer(NOW);
        String url = s.signedUrl(INV, ReceiptKind.BANK, null);

        assertThat(url).doesNotContain("check=");
        assertThat(s.isValid(INV, "BANK", null, Long.parseLong(param(url, "exp")), param(url, "sig"))).isTrue();
    }

    @Test
    void expiredLinkIsRejected() {
        String url = signer(NOW).signedUrl(INV, ReceiptKind.BANK, null);
        long exp = Long.parseLong(param(url, "exp"));

        ReceiptSigner later = signer(Instant.ofEpochSecond(exp + 1));
        assertThat(later.isValid(INV, "BANK", null, exp, param(url, "sig"))).isFalse();
    }

    @Test
    void anyTamperingIsRejected() {
        ReceiptSigner s = signer(NOW);
        String url = s.signedUrl(INV, ReceiptKind.FISCAL_SALE, "check-1");
        long exp = Long.parseLong(param(url, "exp"));
        String sig = param(url, "sig");

        assertThat(s.isValid("0f8b7c1e-1111-2222-3333-999999999999", "FISCAL_SALE", "check-1", exp, sig)).isFalse();
        assertThat(s.isValid(INV, "FISCAL_RETURN", "check-1", exp, sig)).isFalse();
        assertThat(s.isValid(INV, "BANK", "check-1", exp, sig)).isFalse();
        assertThat(s.isValid(INV, "FISCAL_SALE", "check-2", exp, sig)).isFalse();
        assertThat(s.isValid(INV, "FISCAL_SALE", "check-1", exp + 3600, sig)).isFalse();
        assertThat(s.isValid(INV, "FISCAL_SALE", "check-1", exp, sig.substring(1) + "A")).isFalse();
        assertThat(s.isValid(INV, "FISCAL_SALE", "check-1", exp, null)).isFalse();
    }

    @Test
    void anotherSecretDoesNotValidate() {
        String url = signer(NOW).signedUrl(INV, ReceiptKind.BANK, null);
        ReceiptSigner other = signer(NOW, "YW5vdGhlci1zZWNyZXQtdmFsdWUtZm9yLXRlc3Rpbmc=");

        assertThat(other.isValid(INV, "BANK", null, Long.parseLong(param(url, "exp")), param(url, "sig"))).isFalse();
    }
}
