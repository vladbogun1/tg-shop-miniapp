package com.maxsolch.shop.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.config.AppProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
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
 *
 * <p>The ADMIN sign-in ({@link #validateForAdmin}) is stricter than the customer one: a TTL of
 * minutes instead of a day ({@code app.telegram.admin-init-data-ttl-seconds}), and every initData
 * is accepted once, so a copied initData (logs, devtools, a compromised page) cannot be replayed
 * for another admin sign-in. Both paths refuse an {@code auth_date} from the future, a repeated
 * key and a malformed hash; the hash bytes are compared with {@link MessageDigest#isEqual}.
 */
@Component
public class TgInitDataValidator {

    private static final long MAX_CLOCK_SKEW_SECONDS = 60;

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
        return validate(initData, props.getTelegram().getInitDataTtlSeconds(), false);
    }

    /** Signatures of initData already used for an ADMIN sign-in (outlive the admin TTL). */
    private final Cache<String, Boolean> usedForAdmin = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterWrite(Duration.ofHours(1))
            .build();

    /**
     * ADMIN sign-in: short TTL (capped at an hour) and single use (see the class comment).
     *
     * @throws InitDataException on any validation failure, including a replay
     */
    public TelegramUser validateForAdmin(String initData) {
        long ttl = Math.min(props.getTelegram().getAdminInitDataTtlSeconds(), 3600);
        return validate(initData, ttl, true);
    }

    private TelegramUser validate(String initData, long ttlSeconds, boolean singleUse) {
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
            byte[] computed = computeHash(dataCheckString, botToken);
            if (!MessageDigest.isEqual(computed, hexOrEmpty(hash))) {
                throw new InitDataException("initData hash mismatch");
            }
        }

        enforceAuthDateTtl(params.get("auth_date"), allowUnsigned, ttlSeconds);

        if (singleUse) {
            // Keyed by the signature (the whole string when unsigned in dev). Checked after the
            // signature, so junk cannot fill the cache.
            String key = StringUtils.hasText(hash) ? hash.toLowerCase(java.util.Locale.ROOT) : initData;
            if (usedForAdmin.asMap().putIfAbsent(key, Boolean.TRUE) != null) {
                throw new InitDataException("initData was already used, reopen the panel from Telegram");
            }
        }

        String userJson = params.get("user");
        if (!StringUtils.hasText(userJson)) {
            throw new InitDataException("initData has no user");
        }
        return parseUser(userJson);
    }

    private void enforceAuthDateTtl(String authDateRaw, boolean allowUnsigned, long ttl) {
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
        long now = Instant.now().getEpochSecond();
        if (now - authDate > ttl) {
            throw new InitDataException("initData is expired");
        }
        // Telegram stamps auth_date itself; one from the future (beyond clock skew) would stretch
        // the TTL past what we allow.
        if (authDate - now > MAX_CLOCK_SKEW_SECONDS) {
            throw new InitDataException("initData auth_date is in the future");
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
            String languageCode = textOrNull(node, "language_code");
            boolean premium = node.path("is_premium").asBoolean(false);
            String photoUrl = textOrNull(node, "photo_url");
            return new TelegramUser(id, username, firstName, lastName, languageCode, premium, photoUrl);
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
            // A repeated key means the string was tampered with (Telegram never sends one): with
            // "last one wins" the checked data and the used data could differ.
            if (map.put(key, val) != null) {
                throw new InitDataException("initData has a repeated key: " + key);
            }
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

    private static byte[] computeHash(String dataCheckString, String botToken) {
        byte[] secretKey = hmacSha256("WebAppData".getBytes(StandardCharsets.UTF_8),
                botToken.getBytes(StandardCharsets.UTF_8));
        return hmacSha256(secretKey, dataCheckString.getBytes(StandardCharsets.UTF_8));
    }

    /** The received hash as bytes; anything but 64 hex chars becomes an empty array (never equal). */
    private static byte[] hexOrEmpty(String hex) {
        if (hex == null || hex.length() != 64) {
            return new byte[0];
        }
        try {
            return HexFormat.of().parseHex(hex);
        } catch (IllegalArgumentException e) {
            return new byte[0];
        }
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
}
