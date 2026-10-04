package com.maxsolch.shop.analytics;

import com.maxsolch.shop.config.AppProperties;

import java.time.ZoneId;

/** The shop's business timezone for day buckets (falls back to Europe/Kyiv on a bad setting). */
public final class AnalyticsZone {

    private static final ZoneId DEFAULT = ZoneId.of("Europe/Kyiv");

    private AnalyticsZone() {
    }

    public static ZoneId of(AppProperties props) {
        String configured = props == null ? null : props.getTimezone();
        if (configured == null || configured.isBlank()) {
            return DEFAULT;
        }
        try {
            return ZoneId.of(configured.trim());
        } catch (Exception e) {
            return DEFAULT;
        }
    }
}
