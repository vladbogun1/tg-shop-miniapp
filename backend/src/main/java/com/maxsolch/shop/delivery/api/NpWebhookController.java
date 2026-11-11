package com.maxsolch.shop.delivery.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.delivery.app.NpWebhookService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * {@code POST /api/np/webhook} — status pushes of the new Nova Poshta REST. Public (NP calls it), guarded by the
 * shared secret in {@code X-NP-Key}, checked before the body is read. Answers 2xx for anything it accepted or does
 * not care about (a waybill that is not ours), so NP does not retry it; 5xx only when applying failed, so the retry
 * gets another chance. The body may come as text/plain (NP's old default).
 */
@Slf4j
@RestController
@RequestMapping("/api/np")
@Tag(name = "Nova Poshta webhook", description = "Tracking pushes of the new NP REST API")
public class NpWebhookController {

    /** One status push is a few hundred bytes; anything far bigger is not NP. */
    static final int MAX_BODY = 64 * 1024;

    private final NpWebhookService webhooks;
    private final ObjectMapper mapper;

    public NpWebhookController(NpWebhookService webhooks, ObjectMapper mapper) {
        this.webhooks = webhooks;
        this.mapper = mapper;
    }

    /** The body as text, at most {@link #MAX_BODY} bytes (a longer one is an IOException). */
    static String readCapped(HttpServletRequest request) throws IOException {
        if (request.getContentLengthLong() > MAX_BODY) {
            throw new IOException("body of " + request.getContentLengthLong() + " bytes");
        }
        try (InputStream in = request.getInputStream()) {
            byte[] buf = in.readNBytes(MAX_BODY + 1);
            if (buf.length > MAX_BODY) {
                throw new IOException("body over " + MAX_BODY + " bytes");
            }
            return new String(buf, StandardCharsets.UTF_8);
        }
    }

    @PostMapping(value = "/webhook", consumes = "*/*")
    @Operation(summary = "Nova Poshta tracking webhook (X-NP-Key)")
    public ResponseEntity<Map<String, String>> webhook(
            @RequestHeader(value = "X-NP-Key", required = false) String key,
            @RequestHeader(value = "x-np-attempt", required = false) String attempt,
            HttpServletRequest request) {
        if (!webhooks.enabled()) {
            return ResponseEntity.notFound().build();
        }
        // The secret before the body: a stranger's request is not read at all.
        if (!webhooks.authorized(key)) {
            return ResponseEntity.status(401).body(Map.of("status", "unauthorized"));
        }
        String raw;
        try {
            raw = readCapped(request);
        } catch (IOException e) {
            log.info("NP webhook: body not read: {}", e.getMessage());
            return ResponseEntity.status(413).body(Map.of("status", "too_large"));
        }
        JsonNode body;
        try {
            body = raw.isBlank() ? null : mapper.readTree(raw);
        } catch (JsonProcessingException e) {
            log.info("NP webhook: unreadable body ({} chars)", raw.length());
            return ResponseEntity.ok(Map.of("status", "ignored"));
        }
        try {
            NpWebhookService.Outcome out = webhooks.handle(attempt, body);
            return ResponseEntity.ok(Map.of("status", out.name().toLowerCase()));
        } catch (RuntimeException e) {
            log.warn("NP webhook not applied: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("status", "error"));
        }
    }
}
