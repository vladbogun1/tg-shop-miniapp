package com.maxsolch.shop.security;

import com.maxsolch.shop.config.AppProperties;
import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TgInitDataValidatorTest {

    private static final String BOT_TOKEN = "123456:TEST-BOT-TOKEN";
    private static final String USER_JSON =
            "{\"id\":777,\"username\":\"john\",\"first_name\":\"John\",\"last_name\":\"Doe\"}";

    private AppProperties props(boolean allowUnsigned, long ttlSeconds) {
        AppProperties p = new AppProperties();
        p.getTelegram().setBotToken(BOT_TOKEN);
        p.getTelegram().setAllowUnsignedInitData(allowUnsigned);
        p.getTelegram().setInitDataTtlSeconds(ttlSeconds);
        return p;
    }

    // --- helpers mirroring the validator's algorithm to build a correctly signed initData ---

    private static byte[] hmac(byte[] key, byte[] msg) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(msg);
    }

    private static String computeHash(Map<String, String> params, String botToken) throws Exception {
        // data_check_string: sorted "k=v" lines joined by newline (params must exclude "hash").
        List<String> lines = new ArrayList<>();
        for (Map.Entry<String, String> e : new TreeMap<>(params).entrySet()) {
            lines.add(e.getKey() + "=" + e.getValue());
        }
        String dataCheckString = String.join("\n", lines);
        byte[] secret = hmac("WebAppData".getBytes(StandardCharsets.UTF_8),
                botToken.getBytes(StandardCharsets.UTF_8));
        byte[] hash = hmac(secret, dataCheckString.getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().formatHex(hash);
    }

    private static String enc(String v) {
        return URLEncoder.encode(v, StandardCharsets.UTF_8);
    }

    private static String toQuery(Map<String, String> params, String hash) {
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> e : params.entrySet()) {
            if (sb.length() > 0) {
                sb.append('&');
            }
            sb.append(enc(e.getKey())).append('=').append(enc(e.getValue()));
        }
        if (hash != null) {
            sb.append("&hash=").append(hash);
        }
        return sb.toString();
    }

    private static Map<String, String> baseParams(long authDate) {
        Map<String, String> params = new TreeMap<>();
        params.put("auth_date", String.valueOf(authDate));
        params.put("query_id", "AAH123");
        params.put("user", USER_JSON);
        return params;
    }

    // --- tests ---

    @Test
    void validSignedInitData_passes() throws Exception {
        long now = Instant.now().getEpochSecond();
        Map<String, String> params = baseParams(now);
        String hash = computeHash(params, BOT_TOKEN);
        String initData = toQuery(params, hash);

        TgInitDataValidator validator = new TgInitDataValidator(props(false, 86400));
        TelegramUser user = validator.validate(initData);

        assertThat(user.id()).isEqualTo(777L);
        assertThat(user.username()).isEqualTo("john");
        assertThat(user.firstName()).isEqualTo("John");
        assertThat(user.lastName()).isEqualTo("Doe");
    }

    @Test
    void tamperedHash_fails() throws Exception {
        long now = Instant.now().getEpochSecond();
        Map<String, String> params = baseParams(now);
        String hash = computeHash(params, BOT_TOKEN);
        // Corrupt the last hex char.
        String badHash = hash.substring(0, hash.length() - 1) + (hash.endsWith("0") ? "1" : "0");
        String initData = toQuery(params, badHash);

        TgInitDataValidator validator = new TgInitDataValidator(props(false, 86400));

        assertThatThrownBy(() -> validator.validate(initData))
                .isInstanceOf(InitDataException.class)
                .hasMessageContaining("hash mismatch");
    }

    @Test
    void tamperedPayload_failsHashCheck() throws Exception {
        long now = Instant.now().getEpochSecond();
        Map<String, String> params = baseParams(now);
        String hash = computeHash(params, BOT_TOKEN);
        // Sign with original params, but change a value after signing.
        params.put("query_id", "TAMPERED");
        String initData = toQuery(params, hash);

        TgInitDataValidator validator = new TgInitDataValidator(props(false, 86400));

        assertThatThrownBy(() -> validator.validate(initData))
                .isInstanceOf(InitDataException.class)
                .hasMessageContaining("hash mismatch");
    }

    @Test
    void expiredAuthDate_fails() throws Exception {
        long old = Instant.now().getEpochSecond() - 10_000;
        Map<String, String> params = baseParams(old);
        String hash = computeHash(params, BOT_TOKEN);
        String initData = toQuery(params, hash);

        // TTL of 60s -> the 10000s-old auth_date is expired (signature itself is valid).
        TgInitDataValidator validator = new TgInitDataValidator(props(false, 60));

        assertThatThrownBy(() -> validator.validate(initData))
                .isInstanceOf(InitDataException.class)
                .hasMessageContaining("expired");
    }

    @Test
    void emptyInitData_fails() {
        TgInitDataValidator validator = new TgInitDataValidator(props(false, 86400));

        assertThatThrownBy(() -> validator.validate(""))
                .isInstanceOf(InitDataException.class)
                .hasMessageContaining("empty");
    }

    @Test
    void missingHash_fails_whenSignatureRequired() {
        Map<String, String> params = baseParams(Instant.now().getEpochSecond());
        String initData = toQuery(params, null); // no hash

        TgInitDataValidator validator = new TgInitDataValidator(props(false, 86400));

        assertThatThrownBy(() -> validator.validate(initData))
                .isInstanceOf(InitDataException.class)
                .hasMessageContaining("no hash");
    }

    @Test
    void allowUnsigned_bypassesSignature_butStillNeedsUser() {
        // No hash, garbage would-be hash absent; allowUnsigned skips signature entirely.
        Map<String, String> params = baseParams(Instant.now().getEpochSecond());
        String initData = toQuery(params, null);

        TgInitDataValidator validator = new TgInitDataValidator(props(true, 86400));
        TelegramUser user = validator.validate(initData);

        assertThat(user.id()).isEqualTo(777L);
    }

    @Test
    void allowUnsigned_stillFailsWithoutUser() {
        Map<String, String> params = new TreeMap<>();
        params.put("auth_date", String.valueOf(Instant.now().getEpochSecond()));
        String initData = toQuery(params, null); // no user param

        TgInitDataValidator validator = new TgInitDataValidator(props(true, 86400));

        assertThatThrownBy(() -> validator.validate(initData))
                .isInstanceOf(InitDataException.class)
                .hasMessageContaining("no user");
    }
}
