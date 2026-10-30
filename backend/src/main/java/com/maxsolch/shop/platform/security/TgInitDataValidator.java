package com.maxsolch.shop.platform.security;

import com.maxsolch.shop.platform.error.PlatformError;
import java.time.Clock;
import com.fasterxml.jackson.databind.JsonNode;
import com.maxsolch.shop.platform.cache.CacheConfig;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.platform.error.DomainException;
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
    private final Clock clock;

    public TgInitDataValidator(AppProperties props, Clock clock, CacheManager caches) {
        this.usedForAdmin = CacheConfig.require(caches, SecurityCaches.INIT_DATA_USED_FOR_ADMIN.name());
        this.props = props;
        this.clock = clock;
    }

    /**
     * Validate and parse initData, returning the embedded Telegram user.
     *
     * @throws DomainException.Unauthorized on any validation failure
     */
    public TelegramUser validate(String initData) {
        return validate(initData, props.getTelegram().getInitDataTtlSeconds(), false);
    }

    /** Signatures of initData already used for an ADMIN sign-in (outlive the admin TTL). */
    private final Cache usedForAdmin;

    /**
     * ADMIN sign-in: short TTL (capped at an hour) and single use (see the class comment).
     *
     * @throws DomainException.Unauthorized on any validation failure, including a replay
     */
    public TelegramUser validateForAdmin(String initData) {
        long ttl = Math.min(props.getTelegram().getAdminInitDataTtlSeconds(), 3600);
        return validate(initData, ttl, true);
    }

    private TelegramUser validate(String initData, long ttlSeconds, boolean singleUse) {
        if (!StringUtils.hasText(initData)) {
            throw invalid(PlatformError.INITDATA_EMPTY);
        }

        Map<String, String> params = parseQuery(initData);
        String hash = params.remove("hash");

        boolean allowUnsigned = props.getTelegram().isAllowUnsignedInitData();

        if (!allowUnsigned) {
            if (!StringUtils.hasText(hash)) {
                throw invalid(PlatformError.INITDATA_NO_HASH);
            }
            String botToken = props.getTelegram().getBotToken();
            if (!StringUtils.hasText(botToken)) {
                throw invalid(PlatformError.BOT_TOKEN_MISSING);
            }
            String dataCheckString = buildDataCheckString(params);
            byte[] computed = computeHash(dataCheckString, botToken);
            if (!MessageDigest.isEqual(computed, hexOrEmpty(hash))) {
                throw invalid(PlatformError.INITDATA_HASH_MISMATCH);
            }
        }

        enforceAuthDateTtl(params.get("auth_date"), allowUnsigned, ttlSeconds);

        if (singleUse) {
            // Keyed by the signature (the whole string when unsigned in dev). Checked after the
            // signature, so junk cannot fill the cache.
            String key = StringUtils.hasText(hash) ? hash.toLowerCase(java.util.Locale.ROOT) : initData;
            if (usedForAdmin.putIfAbsent(key, Boolean.TRUE) != null) {
                throw invalid(PlatformError.INITDATA_REUSED);
            }
        }

        String userJson = params.get("user");
        if (!StringUtils.hasText(userJson)) {
            throw invalid(PlatformError.INITDATA_NO_USER);
        }
        return parseUser(userJson);
    }

    private void enforceAuthDateTtl(String authDateRaw, boolean allowUnsigned, long ttl) {
        if (!StringUtils.hasText(authDateRaw)) {
            if (allowUnsigned) {
                return;
            }
            throw invalid(PlatformError.INITDATA_NO_AUTH_DATE);
        }
        long authDate;
        try {
            authDate = Long.parseLong(authDateRaw);
        } catch (NumberFormatException e) {
            throw invalid(PlatformError.INITDATA_AUTH_DATE_NAN);
        }
        long now = clock.instant().getEpochSecond();
        if (now - authDate > ttl) {
            throw invalid(PlatformError.INITDATA_EXPIRED);
        }
        // Telegram stamps auth_date itself; one from the future (beyond clock skew) would stretch
        // the TTL past what we allow.
        if (authDate - now > MAX_CLOCK_SKEW_SECONDS) {
            throw invalid(PlatformError.INITDATA_FROM_FUTURE);
        }
    }

    private TelegramUser parseUser(String userJson) {
        try {
            JsonNode node = objectMapper.readTree(userJson);
            long id = node.path("id").asLong();
            if (id == 0) {
                throw invalid(PlatformError.INITDATA_USER_NO_ID);
            }
            String username = textOrNull(node, "username");
            String firstName = textOrNull(node, "first_name");
            String lastName = textOrNull(node, "last_name");
            String languageCode = textOrNull(node, "language_code");
            boolean premium = node.path("is_premium").asBoolean(false);
            String photoUrl = textOrNull(node, "photo_url");
            return new TelegramUser(id, username, firstName, lastName, languageCode, premium, photoUrl);
        } catch (DomainException.Unauthorized e) {
            throw e;
        } catch (Exception e) {
            throw invalid(PlatformError.INITDATA_USER_UNPARSABLE, e);
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
                throw invalid(PlatformError.INITDATA_REPEATED_KEY, key);
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
            throw invalid(PlatformError.HMAC_FAILED, e);
        }
    }

    /** 401 with the reason as text (no code). */
    private static DomainException.Unauthorized invalid(PlatformError reason, Object... args) {
        return new DomainException.Unauthorized(reason, args);
    }

    private static DomainException.Unauthorized invalid(PlatformError reason, Throwable cause) {
        DomainException.Unauthorized e = invalid(reason);
        e.initCause(cause);
        return e;
    }
}
