package com.maxsolch.shop.analytics;

import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.platform.time.ShopZone;

import java.time.ZoneId;

/** The shop's business timezone for day buckets (falls back to Europe/Kyiv on a bad setting). */
public final class AnalyticsZone {

    private AnalyticsZone() {
    }

    /** @deprecated inject {@link ShopZone}; this only reads the same setting. */
    @Deprecated
    public static ZoneId of(AppProperties props) {
        return ShopZone.of(props == null ? null : props.getTimezone()).zone();
    }
}
