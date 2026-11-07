package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiEvents;
import com.maxsolch.shop.ai.domain.AiEvents.Period;
import com.maxsolch.shop.ai.infra.AiAlertStore;
import com.maxsolch.shop.notification.app.AdminPushService;
import com.maxsolch.shop.notification.app.AdminPushService.PushMessage;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.platform.tx.OnCommitted;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.Locale;
import java.util.function.LongPredicate;

/**
 * The seven push warnings to the owner (admins with the finance right, or only the main ones, as the setting says):
 * a limit reached, 80 % of the month, the key refused, search down, free search running out, a batch stopped.
 * Each is said once per period: the unique row in {@code ai_alerts} decides who sends, so two instances or a hundred
 * refused starts give one push. The key warning repeats only after a job has succeeded again.
 */
@Slf4j
@Component
public class AiNotifier {

    static final String KEY = "KEY";
    private static final String URL = "/settings";

    private final AiAlertStore alerts;
    private final AdminPushService push;
    private final AdminAccess access;
    private final AiPolicy policy;
    private final Clock clock;
    private final ShopZone zone;

    public AiNotifier(AiAlertStore alerts, AdminPushService push, AdminAccess access, AiPolicy policy, Clock clock,
                      ShopZone zone) {
        this.alerts = alerts;
        this.push = push;
        this.access = access;
        this.policy = policy;
        this.clock = clock;
        this.zone = zone;
    }

    @OnCommitted
    void onLimit(AiEvents.LimitReached e) {
        String what = e.period() == Period.MONTH ? "месячный" : "дневной";
        say(period(e.period()), "LIMIT_" + e.period(), "ИИ остановлен: достигнут " + what + " лимит",
                "Потрачено " + usd(e.spentMicroUsd()) + " из " + usd(e.limitMicroUsd())
                        + ". Новые задачи не стартуют, пока период не кончится или лимит не поднят.", true);
    }

    @OnCommitted
    void onSpend(AiEvents.SpendWarning e) {
        say(period(Period.MONTH), "WARN_80", "ИИ: потрачено 80 % месячного лимита",
                usd(e.spentMicroUsd()) + " из " + usd(e.limitMicroUsd()) + ".", false);
    }

    @OnCommitted
    void onKey(AiEvents.KeyRejected e) {
        say(KEY, KEY, "ИИ не работает: провайдер отказал",
                "Ключ отклонён или кончились деньги на счёте провайдера. Проверьте ключ и баланс.", true);
    }

    @OnCommitted
    void onSearchDown(AiEvents.SearchDown e) {
        say(period(Period.DAY), "SEARCH_DOWN", "ИИ без поиска",
                "Все поисковые провайдеры не отвечают, ИИ отвечает без интернета.", false);
    }

    @OnCommitted
    void onFreeSearch(AiEvents.FreeSearchWarning e) {
        say("SERPER", "SERPER_80", "Бесплатный поиск заканчивается",
                "Использовано " + e.used() + " из " + e.total() + " бесплатных запросов Serper.", false);
    }

    @OnCommitted
    void onBatch(AiEvents.BatchStopped e) {
        say(period(e.period()), "BATCH_" + e.period(), "Пачка ИИ остановлена",
                "Готово " + e.done() + " из " + e.total() + ": упёрлись в лимит.", true);
    }

    private void say(String period, String threshold, String title, String body, boolean urgent) {
        try {
            if (alerts.claim(period, threshold)) {
                LongPredicate to = policy.alertsToMainOnly() ? access::isSuperAdmin : access::canSeeFinance;
                push.notifyAdmins(new PushMessage(title, body, URL, "ai-" + threshold, null, urgent), to);
            }
        } catch (RuntimeException e) {
            log.warn("ai alert {} failed: {}", threshold, e.toString());
        }
    }

    /** The key of the period in the shop's time: "2026-11" or "2026-11-07". */
    String period(Period p) {
        String day = zone.today(clock).toString();
        return p == Period.MONTH ? day.substring(0, 7) : day;
    }

    private static String usd(long micro) {
        return String.format(Locale.ROOT, "$%.2f", micro / 1_000_000.0);
    }
}
