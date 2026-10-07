package com.maxsolch.shop.payment;

import com.maxsolch.shop.config.AppProperties;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.Base64;

/**
 * Short-lived signed download links for payment receipts ({@code GET /api/receipts/file}).
 *
 * <p>The same idea as {@link com.maxsolch.shop.media.MediaSigner}: a plain {@code <a href>} and
 * the Telegram Mini App's {@code downloadFile} / {@code openLink} cannot carry an Authorization
 * header, so the authorisation travels in the link. The link names OUR invoice row id (not the
 * monobank invoiceId), the receipt kind and the fiscal check id; the HMAC covers all of them and
 * the expiry, so none can be changed, and it dies after {@value #TTL_SECONDS}–
 * {@code TTL + WINDOW} seconds. Links are only handed out to the order's owner and to admins.
 */
@Component
public class ReceiptSigner {

    /** Minimum life of a link: enough to read the list and press «Завантажити». */
    public static final long TTL_SECONDS = 600;

    /** Expiries are snapped to this grid, so a refetch within it returns byte-identical links. */
    private static final long WINDOW_SECONDS = 300;

    private static final String ALGORITHM = "HmacSHA256";

    private final byte[] key;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public ReceiptSigner(AppProperties props) {
        this(props, Clock.systemUTC());
    }

    ReceiptSigner(AppProperties props, Clock clock) {
        // Derived from the JWT secret, with its own prefix: a media signature is never a receipt one.
        String secret = props.getSecurity().getJwtSecret();
        this.key = ("receipt:" + (secret == null ? "" : secret)).getBytes(StandardCharsets.UTF_8);
        this.clock = clock;
    }

    /**
     * Relative (API-base-agnostic) download URL.
     *
     * @param invoiceRowId {@link PaymentInvoice#getId()} as a UUID string
     * @param kind         receipt kind
     * @param checkId      fiscal check id; null for the bank receipt
     */
    public String signedUrl(String invoiceRowId, ReceiptKind kind, String checkId) {
        long now = clock.instant().getEpochSecond();
        long exp = ((now + TTL_SECONDS) / WINDOW_SECONDS + 1) * WINDOW_SECONDS;
        String check = checkId == null ? "" : checkId;
        return "/api/receipts/file?inv=" + enc(invoiceRowId)
                + "&kind=" + kind.name()
                + (check.isEmpty() ? "" : "&check=" + enc(check))
                + "&exp=" + exp
                + "&sig=" + sign(invoiceRowId, kind.name(), check, exp);
    }

    public boolean isValid(String invoiceRowId, String kind, String checkId, long exp, String sig) {
        if (invoiceRowId == null || kind == null || sig == null) {
            return false;
        }
        if (clock.instant().getEpochSecond() > exp) {
            return false;
        }
        return constantTimeEquals(sign(invoiceRowId, kind, checkId == null ? "" : checkId, exp), sig);
    }

    private String sign(String inv, String kind, String check, long exp) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(key, ALGORITHM));
            byte[] digest = mac.doFinal((inv + "|" + kind + "|" + check + "|" + exp).getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to sign receipt url", e);
        }
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
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
