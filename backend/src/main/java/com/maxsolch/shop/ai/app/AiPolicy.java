package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiMoney;
import com.maxsolch.shop.ai.infra.AiUsageQueries;
import com.maxsolch.shop.settings.app.SettingsService;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * What the owner has decided, read from the settings: the switches, the limits, the deadline. One place, so the
 * scenarios do not know setting keys. The kill switch is read from the database on every call ({@link #killSwitchOn}),
 * not from the 60-second snapshot: an instance that did not save the setting must stop too, at its next step.
 */
@Service
public class AiPolicy {

    /** Requests of the free Serper pack. */
    public static final int SERPER_FREE = 2500;

    private final SettingsService settings;
    private final AiUsageQueries usage;

    public AiPolicy(SettingsService settings, AiUsageQueries usage) {
        this.settings = settings;
        this.usage = usage;
    }

    public boolean enabled() {
        return settings.getBool(AiSettings.ENABLED);
    }

    /** The master switch straight from the database. */
    public boolean killSwitchOn() {
        return settings.getBoolFresh(AiSettings.ENABLED);
    }

    public boolean featureOn(AiFeature feature) {
        String key = switch (feature) {
            case CARD -> AiSettings.FEATURE_CARD;
            case COMPLETION -> AiSettings.FEATURE_COMPLETION;
            case TRANSLATION -> AiSettings.FEATURE_TRANSLATION;
            case SUPPLY_EXTRACT, SUPPLY_MATCH -> AiSettings.FEATURE_SUPPLY;
            case SEARCH_TEST -> null;
        };
        return key == null || settings.getBool(key);
    }

    public long monthLimitMicro() {
        return AiMoney.microFromCents(settings.getInt(AiSettings.MONTH_LIMIT_CENTS));
    }

    public long dayLimitMicro() {
        return AiMoney.microFromCents(settings.getInt(AiSettings.DAY_LIMIT_CENTS));
    }

    public int rateMilli() {
        return AiMoney.rateMilliFromKopecks(settings.getInt(AiSettings.RATE_KOPECKS));
    }

    public int ceilingFactor() {
        return settings.getInt(AiSettings.CEILING_FACTOR);
    }

    public Duration deadline() {
        return Duration.ofMinutes(settings.getInt(AiSettings.DEADLINE_MINUTES));
    }

    public Duration retention() {
        return Duration.ofDays(settings.getInt(AiSettings.RETENTION_DAYS));
    }

    public boolean alertsToMainOnly() {
        return AiSettings.ALERTS_MAIN.equals(settings.getString(AiSettings.ALERTS_TO));
    }

    public boolean serperPaidAllowed() {
        return settings.getBool(AiSettings.SERPER_PAID);
    }

    public int serperUsed() {
        return usage.searchesBy("serper");
    }

    /** Serper is asked while the free pack lasts, or when the owner allowed the paid one. */
    public boolean searchProviderAllowed(String provider) {
        return !"serper".equals(provider) || serperPaidAllowed() || serperUsed() < SERPER_FREE;
    }
}
