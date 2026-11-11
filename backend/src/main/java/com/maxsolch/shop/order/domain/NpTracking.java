package com.maxsolch.shop.order.domain;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/** The public Nova Poshta tracking page of a waybill. */
public final class NpTracking {

    private NpTracking() {
    }

    /** Null for a blank number; spaces typed into it are dropped. */
    public static String url(String ttn) {
        if (ttn == null || ttn.isBlank()) {
            return null;
        }
        return "https://novaposhta.ua/tracking/?cargo_number="
                + URLEncoder.encode(ttn.replaceAll("\\s+", ""), StandardCharsets.UTF_8);
    }
}
