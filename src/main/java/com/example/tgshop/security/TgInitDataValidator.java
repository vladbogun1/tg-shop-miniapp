package com.example.tgshop.security;

import com.example.tgshop.config.AppProperties;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.HashMap;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

/**
 * Валидация initData из Telegram Mini Apps.
 *
 * Алгоритм:
 * 1) исключить hash
 * 2) отсортировать пары по ключу
 * 3) secretKey = HMAC_SHA256(message=botToken, key="WebAppData")
 * 4) calcHash  = HMAC_SHA256(message=data_check_string, key=secretKey)
 */
@Component
public class TgInitDataValidator {

  public record Result(
      boolean ok,
      long userId,
      String username,
      String firstName,
      String lastName,
      long authDate
  ) {}

  private final AppProperties props;

  public TgInitDataValidator(AppProperties props) {
    this.props = props;
  }

  public Result validate(String initData) {
    if (initData == null || initData.isBlank()) return new Result(false, 0, null, null, null, 0);

    Map<String, String> data = parseQueryString(initData);
    String receivedHash = data.remove("hash");
    if (receivedHash == null || receivedHash.isBlank()) return new Result(false, 0, null, null, null, 0);

    long authDate = parseLongSafe(data.get("auth_date"));

    if (!props.getSecurity().isAllowUnsignedInitData()) {
      String dataCheckString = data.entrySet().stream()
          .sorted(Map.Entry.comparingByKey())
          .map(e -> e.getKey() + "=" + e.getValue())
          .reduce((a, b) -> a + "\n" + b)
          .orElse("");

      String computed;
      try {
        computed = computeHashHex(props.getTelegram().getBotToken(), dataCheckString);
      } catch (GeneralSecurityException e) {
        return new Result(false, 0, null, null, null, 0);
      }
      if (!computed.equalsIgnoreCase(receivedHash)) {
        return new Result(false, 0, null, null, null, 0);
      }
    }

    String userJson = data.get("user");
    var user = TgUserJson.parse(userJson);
    if (user == null) return new Result(false, 0, null, null, null, 0);

    return new Result(true, user.id(), user.username(), user.firstName(), user.lastName(), authDate);
  }

  private static Map<String, String> parseQueryString(String qs) {
    Map<String, String> out = new HashMap<>();
    for (String part : qs.split("&")) {
      int idx = part.indexOf('=');
      if (idx <= 0) continue;
      String k = URLDecoder.decode(part.substring(0, idx), StandardCharsets.UTF_8);
      String v = URLDecoder.decode(part.substring(idx + 1), StandardCharsets.UTF_8);
      out.put(k, v);
    }
    return out;
  }

  private static String computeHashHex(String botToken, String dataCheckString) throws GeneralSecurityException {
    if (botToken == null || botToken.isBlank()) throw new GeneralSecurityException("BOT_TOKEN is empty");

    byte[] secretKey = hmacSha256("WebAppData".getBytes(StandardCharsets.UTF_8), botToken.getBytes(StandardCharsets.UTF_8));
    byte[] signature = hmacSha256(secretKey, dataCheckString.getBytes(StandardCharsets.UTF_8));
    return toHex(signature);
  }

  private static byte[] hmacSha256(byte[] key, byte[] message) throws GeneralSecurityException {
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(key, "HmacSHA256"));
    return mac.doFinal(message);
  }

  private static String toHex(byte[] bytes) {
    StringBuilder sb = new StringBuilder(bytes.length * 2);
    for (byte b : bytes) sb.append(String.format("%02x", b));
    return sb.toString();
  }

  private static long parseLongSafe(String v) {
    try { return v == null ? 0 : Long.parseLong(v); }
    catch (Exception e) { return 0; }
  }
}
