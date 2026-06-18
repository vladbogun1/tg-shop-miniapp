package com.maxsolch.shop.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.config.AppProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Validates Telegram WebApp {@code initData} per the official algorithm:
 * <pre>
 *   secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
 *   computed   = HMAC_SHA256(key=secret_key, msg=data_check_string)
 *   data_check_string = sorted "k=v" lines (excluding hash), joined by '\n'
 * </pre>
 * Also enforces the {@code auth_date} TTL. When
 * {@code app.telegram.allow-unsigned-init-data=true}, the signature check is skipped
 * (dev only) but the data is still parsed.
 */
@Component
public class TgInitDataValidator {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AppProperties props;

    public TgInitDataValidator(AppProperties props) {
        this.props = props;
    }

    /**
     * Validate and parse initData, returning the embedded Telegram user.
     *
     * @throws InitDataException on any validation failure
     */
    public TelegramUser validate(String initData) {
        if (!StringUtils.hasText(initData)) {
            throw new InitDataException("initData is empty");
        }

        Map<String, String> params = parseQuery(initData);
        String hash = params.remove("hash");

        boolean allowUnsigned = props.getTelegram().isAllowUnsignedInitData();

        if (!allowUnsigned) {
            if (!StringUtils.hasText(hash)) {
                throw new InitDataException("initData has no hash");
            }
            String botToken = props.getTelegram().getBotToken();
            if (!StringUtils.hasText(botToken)) {
                throw new InitDataException("bot token is not configured");
            }
            String dataCheckString = buildDataCheckString(params);
            String computed = computeHash(dataCheckString, botToken);
            if (!constantTimeEquals(computed, hash)) {
                throw new InitDataException("initData hash mismatch");
            }
        }

        enforceAuthDateTtl(params.get("auth_date"), allowUnsigned);

        String userJson = params.get("user");
        if (!StringUtils.hasText(userJson)) {
            throw new InitDataException("initData has no user");
        }
        return parseUser(userJson);
    }

    private void enforceAuthDateTtl(String authDateRaw, boolean allowUnsigned) {
        if (!StringUtils.hasText(authDateRaw)) {
            if (allowUnsigned) {
                return;
            }
            throw new InitDataException("initData has no auth_date");
        }
        long authDate;
        try {
            authDate = Long.parseLong(authDateRaw);
        } catch (NumberFormatException e) {
            throw new InitDataException("initData auth_date is not a number");
        }
        long ttl = props.getTelegram().getInitDataTtlSeconds();
        long now = Instant.now().getEpochSecond();
        if (now - authDate > ttl) {
            throw new InitDataException("initData is expired");
        }
    }

    private TelegramUser parseUser(String userJson) {
        try {
            JsonNode node = objectMapper.readTree(userJson);
            long id = node.path("id").asLong();
            if (id == 0) {
                throw new InitDataException("initData user has no id");
            }
            String username = textOrNull(node, "username");
            String firstName = textOrNull(node, "first_name");
            String lastName = textOrNull(node, "last_name");
            return new TelegramUser(id, username, firstName, lastName);
        } catch (InitDataException e) {
            throw e;
        } catch (Exception e) {
            throw new InitDataException("failed to parse initData user json", e);
        }
    }

    private static String textOrNull(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }

    /** Parse a URL-encoded query string into decoded key/value pairs. */
    private static Map<String, String> parseQuery(String initData) {
        Map<String, String> map = new TreeMap<>();
        for (String pair : initData.split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) {
                continue;
            }
            String key = URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8);
            String val = URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
            map.put(key, val);
        }
        return map;
    }

    /** Sorted "k=v" lines joined by newline. params is already sorted (TreeMap) and hash removed. */
    private static String buildDataCheckString(Map<String, String> params) {
        List<String> lines = new ArrayList<>(params.size());
        for (Map.Entry<String, String> e : params.entrySet()) {
            lines.add(e.getKey() + "=" + e.getValue());
        }
        return String.join("\n", lines);
    }

    private static String computeHash(String dataCheckString, String botToken) {
        byte[] secretKey = hmacSha256("WebAppData".getBytes(StandardCharsets.UTF_8),
                botToken.getBytes(StandardCharsets.UTF_8));
        byte[] hash = hmacSha256(secretKey, dataCheckString.getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().formatHex(hash);
    }

    private static byte[] hmacSha256(byte[] key, byte[] message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(message);
        } catch (Exception e) {
            throw new InitDataException("HMAC computation failed", e);
        }
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null || a.length() != b.length()) {
            return false;
        }
        int result = 0;
        for (int i = 0; i < a.length(); i++) {
            result |= a.charAt(i) ^ b.charAt(i);
        }
        return result == 0;
    }
}
