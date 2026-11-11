package com.maxsolch.shop.delivery.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.List;
import java.util.Map;

/**
 * Nova Poshta JSON API 2.0 with our business key ({@code {apiKey, modelName, calledMethod, methodProperties}}).
 * Every failure is a {@link NovaPoshtaException}: NP's own «success: false» as {@code rejected}, no answer as
 * {@code unavailable}, a write without an answer as {@code uncertain}. The key never leaves the implementation.
 */
public interface NovaPoshtaGateway {

    /** A business key is configured (without one only the public directory works). */
    boolean keyConfigured();

    /** {@code NP_DRY_RUN}: writes are refused here and faked by the callers; reads go to the real API. */
    boolean dryRun();

    ObjectNode props();

    ArrayNode array();

    /** Reads a method and returns {@code data} (an array; empty when the API returned none). Retried. */
    JsonNode call(String model, String method, JsonNode methodProperties);

    default JsonNode call(String model, String method, Map<String, ?> methodProperties) {
        ObjectNode p = props();
        methodProperties.forEach((k, v) -> p.put(k, v == null ? null : String.valueOf(v)));
        return call(model, method, p);
    }

    /**
     * For a customer waiting at the checkout (price hint, street search): one attempt, short timeout, and no
     * waiting while NP is backing us off — the caller shows a fallback instead.
     */
    JsonNode callQuick(String model, String method, JsonNode methodProperties);

    /**
     * A write ({@code save} / {@code update} / {@code delete}): sent exactly once. A timeout or 5xx comes back as
     * uncertain — NP may have done it. Refused under {@code NP_DRY_RUN}.
     */
    JsonNode write(String model, String method, JsonNode methodProperties);

    /**
     * A label/waybill PDF from the cabinet host. {@code kind}: {@code printMarking100x100},
     * {@code printMarking85x85} (A4 sheet of 85×85 labels), {@code printDocument} (A4 waybill).
     */
    byte[] printPdf(String kind, List<String> ttns);

    /** Remaining shared pause after «To many requests», ms (0 = calls go now). */
    long pausedMs();
}
