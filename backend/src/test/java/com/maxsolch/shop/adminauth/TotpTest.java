package com.maxsolch.shop.adminauth;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

/** TOTP / HOTP pinned to the RFC test vectors, plus the verification window and code parsing. */
class TotpTest {

    /** RFC 6238 Appendix B / RFC 4226 Appendix D: the ASCII string "12345678901234567890" (SHA-1). */
    private static final byte[] RFC_SECRET = "12345678901234567890".getBytes(StandardCharsets.US_ASCII);

    @ParameterizedTest(name = "RFC 6238 SHA1 T={0} -> {1}")
    @CsvSource({
            "59,          94287082",
            "1111111109,  07081804",
            "1111111111,  14050471",
            "1234567890,  89005924",
            "2000000000,  69279037",
            "20000000000, 65353130"})
    void rfc6238Vectors(long unixTime, String expected8) {
        long step = Totp.stepAt(unixTime);
        assertThat(Totp.hotp(RFC_SECRET, step, 8)).isEqualTo(expected8);
        // The 6-digit code is the same value modulo 10^6.
        assertThat(Totp.codeAt(RFC_SECRET, step)).isEqualTo(expected8.substring(2));
    }

    @ParameterizedTest(name = "RFC 4226 HOTP counter {0} -> {1}")
    @CsvSource({
            "0, 755224", "1, 287082", "2, 359152", "3, 969429", "4, 338314",
            "5, 254676", "6, 287922", "7, 162583", "8, 399871", "9, 520489"})
    void rfc4226Vectors(long counter, String expected) {
        assertThat(Totp.hotp(RFC_SECRET, counter, 6)).isEqualTo(expected);
    }

    @Test
    void acceptsTheCurrentStepAndOneEitherSide_andReportsWhich() {
        long t = 1_700_000_000L;
        long now = Totp.stepAt(t);
        assertThat(Totp.verify(RFC_SECRET, Totp.codeAt(RFC_SECRET, now), t)).hasValue(now);
        assertThat(Totp.verify(RFC_SECRET, Totp.codeAt(RFC_SECRET, now - 1), t)).hasValue(now - 1);
        assertThat(Totp.verify(RFC_SECRET, Totp.codeAt(RFC_SECRET, now + 1), t)).hasValue(now + 1);
        assertThat(Totp.verify(RFC_SECRET, Totp.codeAt(RFC_SECRET, now - 2), t)).isEmpty();
        assertThat(Totp.verify(RFC_SECRET, Totp.codeAt(RFC_SECRET, now + 2), t)).isEmpty();
    }

    @Test
    void malformedCodesAreRejected_spacesAreFine() {
        long t = 1_700_000_000L;
        String code = Totp.codeAt(RFC_SECRET, Totp.stepAt(t));
        assertThat(Totp.verify(RFC_SECRET, code.substring(0, 3) + " " + code.substring(3), t)).isPresent();
        assertThat(Totp.verify(RFC_SECRET, null, t)).isEmpty();
        assertThat(Totp.verify(RFC_SECRET, "", t)).isEmpty();
        assertThat(Totp.verify(RFC_SECRET, "12345", t)).isEmpty();
        assertThat(Totp.verify(RFC_SECRET, "1234567", t)).isEmpty();
        assertThat(Totp.verify(RFC_SECRET, "12a456", t)).isEmpty();
    }

    @Test
    void otpauthUriCarriesTheStandardParameters() {
        String uri = Totp.otpauthUri("ChiSetup Admin", "boss", "JBSWY3DPEHPK3PXP");
        assertThat(uri).isEqualTo("otpauth://totp/ChiSetup%20Admin:boss?secret=JBSWY3DPEHPK3PXP"
                + "&issuer=ChiSetup%20Admin&algorithm=SHA1&digits=6&period=30");
    }

    @Test
    void newSecretsAre160BitAndRandom() {
        byte[] a = Totp.newSecret();
        byte[] b = Totp.newSecret();
        assertThat(a).hasSize(20);
        assertThat(a).isNotEqualTo(b);
        assertThat(Base32.encode(a)).hasSize(32).matches("[A-Z2-7]+");
    }
}
