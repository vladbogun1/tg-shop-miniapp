package com.maxsolch.shop.analytics.metrics;

/** Sales-channel filter of the metrics page: everything, the Telegram Mini App, or the website. */
public enum ChannelFilter {
    ALL,
    MINIAPP,
    WEB;

    public static ChannelFilter parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return ALL;
        }
        try {
            return valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return ALL;
        }
    }

    /** Whether an order with this {@code orders.source} belongs to the filter (ADMIN only in ALL). */
    public boolean matches(String source) {
        return this == ALL || name().equals(source);
    }

    /** Event channel this filter reads, or null for both. */
    public String eventChannel() {
        return this == ALL ? null : name();
    }
}
