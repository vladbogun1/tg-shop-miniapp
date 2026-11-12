package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiEvents;
import com.maxsolch.shop.ai.domain.AiEvents.Period;
import com.maxsolch.shop.ai.domain.AiMoney;
import com.maxsolch.shop.ai.domain.PauseReason;
import com.maxsolch.shop.ai.infra.AiAlertStore;
import com.maxsolch.shop.notification.app.AdminPushService;
import com.maxsolch.shop.notification.app.AdminPushService.PushMessage;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.platform.tx.OnCommitted;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.function.LongPredicate;

/**
 * The seven push warnings to the owner (admins with the finance right, or only the main ones, as the setting says):
 * a limit reached (day, month), 80 % of the month, the key refused, search down, free search running out, a batch
 * stopped. The texts are those of docs/ai-admin/04-design-final.md, section 6. Each is said once per period: the
 * unique row in {@code ai_alerts} decides who sends, so two instances or a hundred refused starts give one push.
 * The key warning repeats only after a job has succeeded again. A tap leads to the AI block of the settings, or to the
 * task center for a batch.
 */
@Slf4j
@Component
public class AiNotifier {

    static final String KEY = "KEY";
    private static final String URL = "/settings/ai";
    private static final String TASKS_URL = "/ai-tasks";

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
        if (e.period() == Period.MONTH) {
            say(period(Period.MONTH), "LIMIT_MONTH", "ИИ остановлен: месячный лимит",
                    "ИИ остановлен: месячный лимит исчерпан. Админы работают вручную. Поднять лимит можно в Настройках.",
                    true, URL);
        } else {
            say(period(Period.DAY), "LIMIT_DAY", "ИИ на сегодня остановлен",
                    "ИИ на сегодня остановлен: лимит дня исчерпан. Завтра в 00:00 продолжится.", true, URL);
        }
    }

    @OnCommitted
    void onSpend(AiEvents.SpendWarning e) {
        int rate = policy.rateMilli();
        say(period(Period.MONTH), "WARN_80", "ИИ: 80 % месячного лимита",
                "ИИ: потрачено 80 % месячного лимита (" + uah(e.spentMicroUsd(), rate) + " из "
                        + uah(e.limitMicroUsd(), rate) + " ₴). Осталось " + daysLeft() + ".", false, URL);
    }

    @OnCommitted
    void onKey(AiEvents.KeyRejected e) {
        say(KEY, KEY, "ИИ не работает",
                "ИИ не работает: провайдер отклонил ключ. Проверьте ключ или баланс.", true, URL);
    }

    @OnCommitted
    void onSearchDown(AiEvents.SearchDown e) {
        say(period(Period.DAY), "SEARCH_DOWN", "ИИ: поиск недоступен",
                "ИИ: поиск недоступен (свой и платный). Карточки приходят пустыми, админам предложен ручной путь.",
                false, URL);
    }

    @OnCommitted
    void onFreeSearch(AiEvents.FreeSearchWarning e) {
        say("SERPER", "SERPER_80", "Бесплатный поиск заканчивается",
                "Бесплатные запросы Serper: использовано " + e.used() + " из " + e.total()
                        + ". Дальше платный поиск выключен.", false, URL);
    }

    @OnCommitted
    void onBatch(AiEvents.BatchStopped e) {
        String why = e.period() == Period.MONTH ? "лимит месяца" : "лимит дня";
        say(period(e.period()), "BATCH_" + e.period(), "Пакет ИИ остановлен",
                "Пакет остановлен: готово " + e.done() + " из " + e.total() + ", " + why + ". Продолжить кнопкой.",
                true, TASKS_URL);
    }

    /** One push to the admin who started the batch (not to the owner): «Готово N карточек». The batch moves to DONE once. */
    @OnCommitted
    void onBatchFinished(AiEvents.BatchFinished e) {
        try {
            String body = "Готово " + e.done() + " из " + e.total() + ". Откройте очередь, чтобы принять результаты.";
            push.notifyAdmins(new PushMessage("Готово " + e.done() + " " + cards(e.done()), body, TASKS_URL,
                    "ai-batch-" + e.batchId(), null, false), id -> id == e.adminId());
        } catch (RuntimeException ex) {
            log.warn("ai batch push {} failed: {}", e.batchId(), ex.toString());
        }
    }

    /** Three failures in a row, or the search sees nothing: the batch stopped itself and waits for a person. */
    @OnCommitted
    void onBatchProblem(AiEvents.BatchProblem e) {
        String why = e.reason() == PauseReason.SEARCH_DOWN ? "поиск ничего не находит" : "три сбоя подряд";
        say(period(Period.DAY), "BP_" + e.batchId(), "Пакет ИИ остановлен",
                "Пакет остановлен: " + why + ", готово " + e.done() + " из " + e.total() + ".", true, TASKS_URL);
    }

    /** «карточка / карточки / карточек» after a number. */
    static String cards(int n) {
        int mod10 = n % 10;
        int mod100 = n % 100;
        if (mod10 == 1 && mod100 != 11) {
            return "карточка";
        }
        return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "карточки" : "карточек";
    }

    private void say(String period, String threshold, String title, String body, boolean urgent, String url) {
        try {
            if (alerts.claim(period, threshold)) {
                LongPredicate to = policy.alertsToMainOnly() ? access::isSuperAdmin : access::canSeeFinance;
                push.notifyAdmins(new PushMessage(title, body, url, "ai-" + threshold, null, urgent), to);
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

    /** Whole hryvnias for a sentence ("336 из 420 ₴"). */
    private static String uah(long micro, int rate) {
        return String.valueOf(Math.round(AiMoney.costMinor(micro, rate) / 100.0));
    }

    /** "12 дней" / "1 день" / "последний день": until the end of the month in the shop's time. */
    String daysLeft() {
        LocalDate today = zone.today(clock);
        int left = YearMonth.from(today).lengthOfMonth() - today.getDayOfMonth();
        if (left == 0) {
            return "последний день";
        }
        int mod10 = left % 10;
        int mod100 = left % 100;
        boolean few = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14);
        String word = mod10 == 1 && mod100 != 11 ? "день" : few ? "дня" : "дней";
        return left + " " + word;
    }
}
