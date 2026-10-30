package com.maxsolch.shop.platform.config;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Fails the context fast when a dangerous development setting would go live.
 *
 * <p>The dangerous one is {@code app.telegram.allow-unsigned-init-data}: with it on,
 * {@link com.maxsolch.shop.platform.security.TgInitDataValidator} skips the HMAC check entirely, so
 * anyone can POST a hand-written {@code initData} with an arbitrary user id to
 * {@code /api/auth/admin/telegram} and walk away with a 30-day ADMIN token. It is legitimate
 * for local work (there is no Telegram client in a browser tab) and never legitimate anywhere else.
 *
 * <p>The rule: such settings are only tolerated while the {@code dev} profile is active.
 * Any other profile set (including none at all, which is how the server runs) refuses to start.
 * Making the safe configuration the default means forgetting to flip a flag breaks the deploy
 * loudly instead of silently opening the door.
 */
@Slf4j
@Component
public class StartupSecurityCheck {

    /** The base64 placeholder shipped in application.yml — must never sign real tokens. */
    private static final String PLACEHOLDER_JWT_SECRET =
            "Y2hhbmdlLW1lLWJhc2U2NC0yNTZiaXQtc2VjcmV0LWZvci1qd3Qtc2lnbmluZw==";

    private final AppProperties props;
    private final Environment environment;
    private final List<StartupCheck> moduleChecks;

    public StartupSecurityCheck(AppProperties props, Environment environment, List<StartupCheck> moduleChecks) {
        this.props = props;
        this.moduleChecks = moduleChecks;
        this.environment = environment;
    }

    @PostConstruct
    void verify() {
        boolean dev = isDevProfile();
        List<String> fatal = new ArrayList<>();

        if (props.getTelegram().isAllowUnsignedInitData()) {
            if (dev) {
                log.warn("╔══════════════════════════════════════════════════════════════════════╗");
                log.warn("║  ALLOW_UNSIGNED_INIT_DATA=true — Telegram initData НЕ проверяется.   ║");
                log.warn("║  Любой может выпустить себе ADMIN-токен. Только для локальной        ║");
                log.warn("║  разработки (профиль dev). НИКОГДА не выкатывать с этим флагом.      ║");
                log.warn("╚══════════════════════════════════════════════════════════════════════╝");
            } else {
                fatal.add("ALLOW_UNSIGNED_INIT_DATA=true вне профиля 'dev' — это полный обход "
                        + "авторизации (любой может выпустить себе ADMIN-токен). "
                        + "Поставьте ALLOW_UNSIGNED_INIT_DATA=false.");
            }
        }

        String jwtSecret = props.getSecurity().getJwtSecret();
        if (PLACEHOLDER_JWT_SECRET.equals(jwtSecret)) {
            String message = "JWT_SECRET не задан — используется публичный плейсхолдер из "
                    + "application.yml, любой может подделать токен. Сгенерируйте: openssl rand -base64 32";
            if (dev) {
                log.warn("SECURITY: {}", message);
            } else {
                fatal.add(message);
            }
        }

        // Public site: auth cookies without Secure would travel over plain http.
        AppProperties.Site site = props.getSite();
        if (!dev && Boolean.FALSE.equals(site.getWebCookieSecure())) {
            log.warn("SECURITY: WEB_COOKIE_SECURE=false вне профиля dev — cookie входа на сайт "
                    + "уйдут по http. На проде должно быть true (или не задано).");
        }
        if (!dev && (site.getBaseUrl() == null || site.getBaseUrl().isBlank())) {
            log.warn("SITE_BASE_URL не задан — запросы сайта с cookie-авторизацией будут отклоняться (403).");
        }

        for (StartupCheck check : moduleChecks) {
            check.check(dev, fatal);
        }

        if (!fatal.isEmpty()) {
            String details = String.join("\n  • ", fatal);
            throw new IllegalStateException("Небезопасная конфигурация, запуск остановлен:\n  • "
                    + details
                    + "\n(Для локальной разработки запускайте с SPRING_PROFILES_ACTIVE=dev.)");
        }

        log.info("Startup security check passed (profiles: {})",
                Arrays.toString(environment.getActiveProfiles()));
    }

    private boolean isDevProfile() {
        for (String profile : environment.getActiveProfiles()) {
            if ("dev".equalsIgnoreCase(profile) || "local".equalsIgnoreCase(profile)) {
                return true;
            }
        }
        return false;
    }
}
