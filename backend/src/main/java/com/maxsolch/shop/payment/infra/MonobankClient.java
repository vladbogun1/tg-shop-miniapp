package com.maxsolch.shop.payment.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.payment.domain.MonobankGateway;
import com.maxsolch.shop.payment.domain.MonobankInvoiceStatus;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.platform.http.HttpClientSettings;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.ResilientHttp;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * monobank acquiring API over {@code platform.http}: 5 s to connect, 15 s per request (as before the move to the
 * platform client), no retries by default — the customer waits on these calls, and a repeat would double the
 * worst case. {@code app.http.clients.monobank.max-retries} turns on bounded retries of the GET calls; a POST
 * (create invoice, refund, remove) is never repeated. The token never reaches a log.
 */
@Slf4j
@Component
public class MonobankClient implements MonobankGateway {

    static final String CLIENT_NAME = "monobank";

    private final AppProperties props;
    private final ObjectMapper mapper;
    private final ResilientHttp http;

    public MonobankClient(AppProperties props, ObjectMapper mapper, HttpClients clients) {
        this.props = props;
        this.mapper = mapper;
        this.http = clients.create(HttpClientSettings.defaults(CLIENT_NAME)
                .withTimeouts(Duration.ofSeconds(5), Duration.ofSeconds(15)));
    }

    @Override
    public boolean isEnabled() {
        return props.getPayment().getMonobank().isEnabled();
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

    @Override
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

    @Override
    public MonobankInvoiceStatus status(String invoiceId) {
        JsonNode res = call("GET", "/api/merchant/invoice/status?invoiceId=" + enc(invoiceId), null);
        return mapper.convertValue(res, MonobankInvoiceStatus.class);
    }

    @Override
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

    @Override
    public void remove(String invoiceId) {
        call("POST", "/api/merchant/invoice/remove", Map.of("invoiceId", invoiceId));
    }

    @Override
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

    @Override
    public byte[] bankReceipt(String invoiceId) {
        String file = call("GET", "/api/merchant/invoice/receipt?invoiceId=" + enc(invoiceId), null)
                .path("file").asText(null);
        return MonobankGateway.decodePdf(file);
    }

    @Override
    public String pubkey() {
        return call("GET", "/api/merchant/pubkey", null).path("key").asText(null);
    }

    @Override
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
                    .header("X-Token", cfg.getToken())
                    .header("X-Cms", "chisetup")
                    .header("Accept", "application/json");
            if (body != null) {
                b.header("Content-Type", "application/json")
                        .method(method, HttpRequest.BodyPublishers.ofByteArray(mapper.writeValueAsBytes(body)));
            } else {
                b.method(method, HttpRequest.BodyPublishers.noBody());
            }
            // retried only when idempotent by method (GET), and only if max-retries is raised above 0
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
}
