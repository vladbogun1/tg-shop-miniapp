package com.maxsolch.shop.payment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.config.AppProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * monobank acquiring API (https://monobank.ua/api-docs/acquiring) — the few calls the shop needs.
 * Plain {@link HttpClient} + Jackson, like the other integrations. The token never reaches a log.
 */
@Slf4j
@Component
public class MonobankClient {

    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(15);

    private final AppProperties props;
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    public MonobankClient(AppProperties props, ObjectMapper mapper) {
        this.props = props;
        this.mapper = mapper;
    }

    public boolean isEnabled() {
        return props.getPayment().getMonobank().isEnabled();
    }

    /**
     * One line of the basket shown on the payment page and used for fiscal receipts.
     * {@code tax} — tax rate codes of the merchant's PRRO (mandatory for Вчасно.Каса); may be empty.
     */
    public record BasketItem(String name, long qty, long sum, String code, List<Integer> tax) {

        public BasketItem(String name, long qty, long sum, String code) {
            this(name, qty, sum, code, List.of());
        }
    }

    private static Map<String, Object> item(BasketItem b, boolean withUnit) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("name", b.name());
        m.put("qty", b.qty());
        m.put("sum", b.sum());
        m.put("code", b.code());
        if (withUnit) {
            m.put("total", b.sum() * b.qty());
            m.put("unit", "шт.");
        }
        if (b.tax() != null && !b.tax().isEmpty()) {
            m.put("tax", b.tax());
        }
        return m;
    }

    public record CreateInvoice(long amount, String reference, String destination, List<BasketItem> basket,
                                String redirectUrl, String webHookUrl, long validitySeconds, boolean iframe) {
    }

    public record CreatedInvoice(String invoiceId, String pageUrl) {
    }

    public record MerchantDetails(String merchantId, String merchantName, String edrpou) {
    }

    /** {@code POST /api/merchant/invoice/create}. */
    public CreatedInvoice createInvoice(CreateInvoice req) {
        Map<String, Object> paymInfo = new java.util.LinkedHashMap<>();
        paymInfo.put("reference", req.reference());
        paymInfo.put("destination", req.destination());
        if (req.basket() != null && !req.basket().isEmpty()) {
            paymInfo.put("basketOrder", req.basket().stream().map(b -> item(b, true)).toList());
        }
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("amount", req.amount());
        body.put("ccy", 980);
        body.put("merchantPaymInfo", paymInfo);
        body.put("redirectUrl", req.redirectUrl());
        body.put("webHookUrl", req.webHookUrl());
        body.put("validity", req.validitySeconds());
        body.put("paymentType", "debit");
        if (req.iframe()) {
            // Layout for embedding in our modal (<iframe allow="payment *">).
            body.put("displayType", "iframe");
        }
        JsonNode res = call("POST", "/api/merchant/invoice/create", body);
        return new CreatedInvoice(res.path("invoiceId").asText(null), res.path("pageUrl").asText(null));
    }

    /** {@code GET /api/merchant/invoice/status}. */
    public MonobankInvoiceStatus status(String invoiceId) {
        JsonNode res = call("GET", "/api/merchant/invoice/status?invoiceId=" + enc(invoiceId), null);
        return mapper.convertValue(res, MonobankInvoiceStatus.class);
    }

    /** {@code POST /api/merchant/invoice/cancel} — full refund when {@code amount} is null. */
    public String cancel(String invoiceId, String extRef, Long amount) {
        return cancel(invoiceId, extRef, amount, List.of());
    }

    /**
     * Refund with the returned items ({@code items} — mandatory when fiscalisation is on, so a
     * return receipt can be issued).
     */
    public String cancel(String invoiceId, String extRef, Long amount, List<BasketItem> items) {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("invoiceId", invoiceId);
        body.put("extRef", extRef);
        if (amount != null) {
            body.put("amount", amount);
        }
        if (items != null && !items.isEmpty()) {
            body.put("items", items.stream().map(b -> item(b, false)).toList());
        }
        return call("POST", "/api/merchant/invoice/cancel", body).path("status").asText(null);
    }

    /** {@code POST /api/merchant/invoice/remove} — closes an unpaid payment page. */
    public void remove(String invoiceId) {
        call("POST", "/api/merchant/invoice/remove", Map.of("invoiceId", invoiceId));
    }

    /**
     * One fiscal receipt of an invoice (PRRO — Вчасно.Каса / Checkbox / monopay).
     *
     * @param type   sale | return
     * @param status new | process | done | failed
     * @param file   base64 PDF; usually only once {@code done}
     */
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    public record FiscalCheck(String id, String type, String status, String statusDescription, String taxUrl,
                              String file, String fiscalizationSource) {

        public boolean isDone() {
            return "done".equalsIgnoreCase(status);
        }

        public boolean isFailed() {
            return "failed".equalsIgnoreCase(status);
        }

        public boolean isReturn() {
            return "return".equalsIgnoreCase(type);
        }
    }

    /** {@code GET /api/merchant/invoice/fiscal-checks} — empty when fiscalisation is off. */
    public List<FiscalCheck> fiscalChecks(String invoiceId) {
        JsonNode res = call("GET", "/api/merchant/invoice/fiscal-checks?invoiceId=" + enc(invoiceId), null);
        JsonNode checks = res.path("checks");
        if (!checks.isArray()) {
            return List.of();
        }
        List<FiscalCheck> out = new java.util.ArrayList<>();
        for (JsonNode c : checks) {
            out.add(mapper.convertValue(c, FiscalCheck.class));
        }
        return out;
    }

    /**
     * {@code GET /api/merchant/invoice/receipt} — the bank's payment receipt (квитанція) as a PDF.
     * Not a fiscal document; works without a PRRO. Null when monobank returned no file.
     */
    public byte[] bankReceipt(String invoiceId) {
        String file = call("GET", "/api/merchant/invoice/receipt?invoiceId=" + enc(invoiceId), null)
                .path("file").asText(null);
        return decodePdf(file);
    }

    /** base64 → bytes; null for a missing or broken value. */
    public static byte[] decodePdf(String base64) {
        if (base64 == null || base64.isBlank()) {
            return null;
        }
        try {
            return java.util.Base64.getMimeDecoder().decode(base64);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** {@code GET /api/merchant/pubkey} — base64 of the PEM public key for webhook signatures. */
    public String pubkey() {
        return call("GET", "/api/merchant/pubkey", null).path("key").asText(null);
    }

    /** {@code GET /api/merchant/details} — also a cheap "is the token valid" probe. */
    public MerchantDetails details() {
        JsonNode res = call("GET", "/api/merchant/details", null);
        return new MerchantDetails(res.path("merchantId").asText(null), res.path("merchantName").asText(null),
                res.path("edrpou").asText(null));
    }

    private JsonNode call(String method, String path, Object body) {
        AppProperties.Monobank cfg = props.getPayment().getMonobank();
        if (!cfg.isEnabled()) {
            throw new MonobankException(0, "DISABLED", "monobank token is not configured");
        }
        try {
            HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(trimSlash(cfg.getApiUrl()) + path))
                    .timeout(REQUEST_TIMEOUT)
                    .header("X-Token", cfg.getToken())
                    .header("X-Cms", "chisetup")
                    .header("Accept", "application/json");
            if (body != null) {
                b.header("Content-Type", "application/json")
                        .method(method, HttpRequest.BodyPublishers.ofByteArray(mapper.writeValueAsBytes(body)));
            } else {
                b.method(method, HttpRequest.BodyPublishers.noBody());
            }
            HttpResponse<String> res = http.send(b.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            String text = res.body() == null ? "" : res.body();
            if (res.statusCode() / 100 != 2) {
                String errCode = null;
                String errText = text;
                try {
                    JsonNode err = mapper.readTree(text);
                    errCode = err.path("errCode").asText(null);
                    errText = err.path("errText").asText(text);
                } catch (IOException ignored) {
                    // not JSON — keep the raw text
                }
                throw new MonobankException(res.statusCode(), errCode, errText);
            }
            return text.isBlank() ? mapper.createObjectNode() : mapper.readTree(text);
        } catch (MonobankException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new MonobankException(0, "INTERRUPTED", e.getMessage());
        } catch (Exception e) {
            throw new MonobankException(0, "IO", e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private static String trimSlash(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    /** A monobank call failed: HTTP status (0 = no response), errCode, errText. */
    public static class MonobankException extends RuntimeException {
        private final String errCode;

        public MonobankException(int httpStatus, String errCode, String errText) {
            super("monobank " + (httpStatus == 0 ? "" : httpStatus + " ") + (errCode == null ? "" : errCode + ": ") + errText);
            this.errCode = errCode;
        }

        public String getErrCode() {
            return errCode;
        }
    }
}
