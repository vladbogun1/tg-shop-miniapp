package com.maxsolch.shop.adminauth;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Base32 (RFC 4648), HKDF (RFC 5869) and the AES-GCM box for TOTP secrets. */
class CryptoPrimitivesTest {

    @ParameterizedTest(name = "base32({0}) = {1}")
    @CsvSource(value = {"'',''", "f,MY", "fo,MZXQ", "foo,MZXW6", "foob,MZXW6YQ", "fooba,MZXW6YTB",
            "foobar,MZXW6YTBOI"})
    void base32Rfc4648Vectors(String plain, String encoded) {
        byte[] bytes = plain.getBytes(StandardCharsets.US_ASCII);
        assertThat(Base32.encode(bytes)).isEqualTo(encoded);
        assertThat(Base32.decode(encoded)).isEqualTo(bytes);
    }

    @Test
    void base32DecodeIsForgivingAboutCaseSpacesAndPadding_butNotJunk() {
        assertThat(Base32.decode("mzxw 6ytb oi======")).isEqualTo("foobar".getBytes(StandardCharsets.US_ASCII));
        assertThatThrownBy(() -> Base32.decode("MZXW1")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void hkdfRfc5869TestCase1() {
        HexFormat hex = HexFormat.of();
        byte[] ikm = hex.parseHex("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b");
        byte[] salt = hex.parseHex("000102030405060708090a0b0c");
        byte[] info = hex.parseHex("f0f1f2f3f4f5f6f7f8f9");
        assertThat(hex.formatHex(Hkdf.derive(ikm, salt, info, 42))).isEqualTo(
                "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865");
    }

    @Test
    void hkdfRfc5869TestCase3_noSaltNoInfo() {
        HexFormat hex = HexFormat.of();
        byte[] ikm = hex.parseHex("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b");
        assertThat(hex.formatHex(Hkdf.derive(ikm, new byte[0], new byte[0], 42))).isEqualTo(
                "8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8");
    }

    private static byte[] key(int fill) {
        byte[] k = new byte[32];
        java.util.Arrays.fill(k, (byte) fill);
        return k;
    }

    @Test
    void secretRoundTripsAndEveryEncryptionIsDifferent() {
        SecretCipher box = new SecretCipher(key(7));
        byte[] secret = Totp.newSecret();
        String a = box.encrypt(secret, 42L);
        String b = box.encrypt(secret, 42L);
        assertThat(a).startsWith("v1:").isNotEqualTo(b); // random IV
        assertThat(a).doesNotContain(Base32.encode(secret));
        assertThat(box.decrypt(a, 42L)).isEqualTo(secret);
        assertThat(box.decrypt(b, 42L)).isEqualTo(secret);
    }

    @Test
    void secretIsBoundToItsAdminAndKey_andTamperingIsDetected() {
        SecretCipher box = new SecretCipher(key(7));
        String stored = box.encrypt(Totp.newSecret(), 42L);

        // Copied into another admin's row: the associated data differs.
        assertThatThrownBy(() -> box.decrypt(stored, 43L)).isInstanceOf(IllegalStateException.class);
        // Another key (ADMIN_2FA_KEY changed).
        assertThatThrownBy(() -> new SecretCipher(key(8)).decrypt(stored, 42L))
                .isInstanceOf(IllegalStateException.class);
        // One flipped bit.
        byte[] raw = Base64.getDecoder().decode(stored.substring(3));
        raw[raw.length - 1] ^= 1;
        String tampered = "v1:" + Base64.getEncoder().encodeToString(raw);
        assertThatThrownBy(() -> box.decrypt(tampered, 42L)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> box.decrypt("plain-secret", 42L)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void configuredKeyMustBe32BytesOfBase64_blankFallsBackToHkdf() {
        byte[] jwt = key(1);
        String good = Base64.getEncoder().encodeToString(key(9));
        assertThat(AdminAuthKeys.resolve2faKey(good, jwt)).isEqualTo(key(9));
        assertThatThrownBy(() -> AdminAuthKeys.resolve2faKey(Base64.getEncoder().encodeToString(new byte[16]), jwt))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("32 bytes");
        assertThatThrownBy(() -> AdminAuthKeys.resolve2faKey("%%%", jwt)).isInstanceOf(IllegalStateException.class);
        byte[] derived = AdminAuthKeys.resolve2faKey("", jwt);
        assertThat(derived).hasSize(32).isNotEqualTo(jwt);
        assertThat(AdminAuthKeys.resolve2faKey(null, jwt)).isEqualTo(derived); // deterministic
    }
}
