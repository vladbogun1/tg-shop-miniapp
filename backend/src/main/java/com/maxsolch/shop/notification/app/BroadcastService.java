package com.maxsolch.shop.notification.app;

import com.maxsolch.shop.platform.jobs.Workers;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.notification.domain.Broadcast;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.jobs.DbLocks;
import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.notification.infra.BroadcastRepository;
import com.maxsolch.shop.notification.domain.BroadcastAudiences;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.notification.domain.TelegramGateway;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.api.objects.webapp.WebAppInfo;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicReference;

import static com.maxsolch.shop.platform.util.Texts.blankToNull;

/**
 * Sends HTML-formatted Telegram broadcasts to a chosen audience. One broadcast runs at a time
 * (a database lock, so a second backend instance respects it too) on a single background thread; progress is exposed via {@link #status()} for the admin UI to poll.
 * A send that hits "bot blocked / user deactivated" marks the user blocked (so the Users tab shows it).
 *
 * <p>R9: the audience can be narrowed to one language, each customer gets the version of the text
 * in their language when one was written (else the main text), and every broadcast is kept in the
 * {@code broadcasts} table with its result.
 */
@Slf4j
@Service
public class BroadcastService {

    private enum Outcome { OK, BLOCKED, FAILED }

    /** One message to send: chat id + language that picks the text variant. */
    record Recipient(long id, String lang) {
    }

    /** The lock of the running broadcast: renewed while it makes progress, free {@value} minutes after a crash. */
    static final String LOCK_NAME = "broadcast";
    private static final Duration LOCK_TTL = Duration.ofMinutes(5);

    private static final Map<String, String> DEFAULT_BUTTON = Map.of(
            "uk", "🛍 Відкрити магазин",
            "ru", "🛍 Открыть магазин",
            "en", "🛍 Open the shop");

    private final TelegramGateway bot;
    private final AppProperties props;
    private final BroadcastAudiences audiences;
    private final BroadcastRepository broadcastRepository;
    private final ActivityLog activity;
    private final Clock clock;
    private final AdminAuditService audit;
    private final CurrentActor actor;
    private final DbLocks locks;

    private final ExecutorService exec;
    private final AtomicReference<BroadcastStatus> status = new AtomicReference<>(BroadcastStatus.idle());

    public BroadcastService(TelegramGateway bot, AppProperties props, BroadcastAudiences audiences,
                            BroadcastRepository broadcastRepository, ActivityLog activity, Clock clock,
                            AdminAuditService audit, CurrentActor actor, DbLocks locks, Workers workers) {
        this.exec = workers.single("broadcast");
        this.locks = locks;
        this.bot = bot;
        this.props = props;
        this.audiences = audiences;
        this.broadcastRepository = broadcastRepository;
        this.activity = activity;
        this.clock = clock;
        this.audit = audit;
        this.actor = actor;
    }

    /** A RUNNING history row after a restart was cut off mid-send — say so instead of "running". */
    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void closeInterrupted() {
        try {
            int n = broadcastRepository.markInterrupted();
            if (n > 0) {
                log.info("Marked {} broadcast(s) interrupted by a restart", n);
            }
        } catch (Exception e) {
            log.warn("Could not close interrupted broadcasts: {}", e.getMessage());
        }
    }

    private boolean enabled() {
        String token = props.getTelegram().getBotToken();
        return token != null && !token.isBlank();
    }

    public BroadcastStatus status() {
        return status.get();
    }

    public List<BroadcastHistoryDto> history(int limit) {
        return broadcastRepository.recent(PageRequest.of(0, Math.min(Math.max(1, limit), 100))).stream()
                .map(BroadcastHistoryDto::of)
                .toList();
    }

    /**
     * Audience sizes for the compose UI. Without a language: four COUNTs, not four fully
     * materialised id lists; with one, the lists are intersected with the language map.
     */
    public Map<String, Long> audienceCounts(String lang) {
        String l = normLang(lang);
        if (l == null) {
            return Map.of(
                    "all", audiences.count("all"),
                    "active", audiences.count("active"),
                    "inactive", audiences.count("inactive"),
                    "premium", audiences.count("premium"));
        }
        Map<Long, String> langs = languages();
        Map<String, Long> out = new LinkedHashMap<>();
        for (String a : List.of("all", "active", "inactive", "premium")) {
            out.put(a, resolveAudience(a).stream().filter(id -> l.equals(langs.get(id))).count());
        }
        return out;
    }

    /** The test message of the admin screen (to the given customer, else to the admin themselves), written to the audit. */
    public BroadcastResult sendTest(BroadcastTestRequest req) {
        long to = req.telegramUserId() != null ? req.telegramUserId() : actor.userId();
        BroadcastResult result = test(req.text(), to, req.withButton(), req.buttonText());
        audit.record("BROADCAST_TEST", "BROADCAST", null,
                "тест → " + (req.telegramUserId() == null ? "себе" : String.valueOf(to))
                        + (result.ok() ? "" : " (" + result.detail() + ")"));
        return result;
    }

    /** The admin screen starts a broadcast as the current admin; a started one is written to the audit. */
    public BroadcastStatus startAsAdmin(BroadcastRequest req) {
        Started started = start(req, actor.userId(), audit.currentAdminName());
        // Written after the start succeeded: a refused start ("уже идёт") is not an action.
        String langs = (req.textUk() != null && !req.textUk().isBlank() ? " uk" : "")
                + (req.textRu() != null && !req.textRu().isBlank() ? " ru" : "")
                + (req.textEn() != null && !req.textEn().isBlank() ? " en" : "");
        audit.record("BROADCAST_START", "BROADCAST", String.valueOf(started.historyId()),
                "аудитория " + (req.audience() == null ? "all" : req.audience())
                        + (req.lang() == null || req.lang().isBlank() ? "" : ", язык " + req.lang())
                        + ", получателей " + started.recipients()
                        + (langs.isEmpty() ? "" : ", версии:" + langs));
        return started.status();
    }

    /** Start a broadcast (async). Throws 409 if one is already running. Returns the history id too. */
    public Started start(BroadcastRequest req, Long adminId, String adminName) {
        if (!enabled()) {
            throw new DomainException.Unavailable("Бот не настроен");
        }
        if (status.get().running()) {
            throw new DomainException.Conflict("Рассылка уже идёт", null, null);
        }
        DbLocks.Held lock = locks.tryLock(LOCK_NAME, LOCK_TTL)
                .orElseThrow(() -> new DomainException.Conflict("Рассылка уже идёт", null, null));
        try {
            return begin(req, adminId, adminName, lock);
        } catch (RuntimeException e) {
            lock.release();
            throw e;
        }
    }

    private Started begin(BroadcastRequest req, Long adminId, String adminName, DbLocks.Held lock) {
        String audience = req.audience() == null || req.audience().isBlank()
                ? "all" : req.audience().trim().toLowerCase(Locale.ROOT);
        String lang = normLang(req.lang());
        List<Recipient> recipients = recipients(resolveAudience(audience), languages(), lang);

        Broadcast row = new Broadcast();
        row.setAdminId(adminId);
        row.setAdminName(adminName);
        row.setText(req.text());
        row.setTextUk(blankToNull(req.textUk()));
        row.setTextRu(blankToNull(req.textRu()));
        row.setTextEn(blankToNull(req.textEn()));
        row.setAudience(audience);
        row.setLang(lang);
        row.setWithButton(req.withButton());
        row.setStatus(Broadcast.RUNNING);
        row.setTotal(recipients.size());
        row.setStartedAt(clock.instant());
        Broadcast saved = broadcastRepository.save(row);

        BroadcastStatus start = new BroadcastStatus(true, recipients.size(), 0, 0, 0, saved.getStartedAt(), null);
        status.set(start);
        exec.submit(() -> run(saved, recipients, req.withButton(), req.buttonText(), lock));
        return new Started(start, saved.getId(), recipients.size());
    }

    /** Result of {@link #start}: live status + the history row id (for the audit log). */
    public record Started(BroadcastStatus status, long historyId, int recipients) {
    }

    /** Optional "open the shop" web_app button (private chats only; needs an HTTPS webapp URL). */
    private InlineKeyboardMarkup shopButton(boolean withButton, String buttonText, String lang) {
        if (!withButton) {
            return null;
        }
        String webapp = props.getWebappBaseUrl();
        if (webapp == null || !webapp.startsWith("https://")) {
            return null; // Telegram rejects non-HTTPS web_app buttons → skip rather than fail the send
        }
        // A typed label is used as is; the default one follows the recipient's language, like the text.
        String label = (buttonText == null || buttonText.isBlank())
                ? DEFAULT_BUTTON.getOrDefault(lang == null ? "ru" : lang, DEFAULT_BUTTON.get("ru"))
                : buttonText.trim();
        InlineKeyboardButton btn = InlineKeyboardButton.builder()
                .text(label)
                .webApp(WebAppInfo.builder().url(webapp).build())
                .build();
        return InlineKeyboardMarkup.builder().keyboard(List.of(List.of(btn))).build();
    }

    private void run(Broadcast row, List<Recipient> recipients, boolean withButton, String buttonText,
                     DbLocks.Held lock) {
        int sent = 0, failed = 0, blocked = 0;
        Map<String, InlineKeyboardMarkup> buttons = new HashMap<>();
        try {
            int i = 0;
            for (Recipient r : recipients) {
                String html = textFor(r.lang(), row.getText(), row.getTextUk(), row.getTextRu(), row.getTextEn());
                InlineKeyboardMarkup markup = buttons.computeIfAbsent(String.valueOf(r.lang()),
                        k -> shopButton(withButton, buttonText, r.lang()));
                Outcome o = sendOne(r.id(), html, markup, ActivityLog.Entry.bot("BROADCAST")
                        .group(ActivityLog.broadcastGroup(row.getId())).detail("lang", r.lang()));
                switch (o) {
                    case OK -> sent++;
                    case BLOCKED -> blocked++;
                    case FAILED -> failed++;
                }
                status.set(new BroadcastStatus(true, recipients.size(), sent, failed, blocked,
                        status.get().startedAt(), null));
                if (++i % 50 == 0) {
                    persist(row, sent, failed, blocked, Broadcast.RUNNING, null);
                    extend(lock);
                }
                sleep(45); // ~22 msg/s — well under Telegram's bulk limit
            }
        } finally {
            Instant end = clock.instant();
            status.set(new BroadcastStatus(false, recipients.size(), sent, failed, blocked,
                    status.get().startedAt(), end));
            persist(row, sent, failed, blocked, Broadcast.DONE, end);
            log.info("Broadcast #{} finished: total={} sent={} failed={} blocked={}",
                    row.getId(), recipients.size(), sent, failed, blocked);
            try {
                lock.release();
            } catch (RuntimeException e) {
                log.warn("Could not release the broadcast lock (it expires by itself): {}", e.getMessage());
            }
        }
    }

    private static void extend(DbLocks.Held lock) {
        try {
            lock.extend(LOCK_TTL);
        } catch (RuntimeException e) {
            log.warn("Could not renew the broadcast lock: {}", e.getMessage());
        }
    }

    private void persist(Broadcast row, int sent, int failed, int blocked, String st, Instant finishedAt) {
        try {
            row.setSent(sent);
            row.setFailed(failed);
            row.setBlocked(blocked);
            row.setStatus(st);
            row.setFinishedAt(finishedAt);
            broadcastRepository.save(row);
        } catch (Exception e) {
            log.warn("Could not save broadcast #{} progress: {}", row.getId(), e.getMessage());
        }
    }

    /** Send one test message to a specific user. */
    public BroadcastResult test(String text, long telegramUserId, boolean withButton, String buttonText) {
        if (!enabled()) {
            return new BroadcastResult(false, "Бот не настроен");
        }
        Outcome o = sendOne(telegramUserId, text, shopButton(withButton, buttonText, null),
                ActivityLog.Entry.bot("BROADCAST_TEST"));
        return switch (o) {
            case OK -> new BroadcastResult(true, "Отправлено");
            case BLOCKED -> new BroadcastResult(false, "Получатель заблокировал бота или ещё не писал ему");
            case FAILED -> new BroadcastResult(false, "Не удалось отправить — проверьте разметку текста и получателя");
        };
    }

    /**
     * Sends one message. {@code journal} (type + broadcast group) gets the recipient, the text and
     * the outcome and is written to the «Бот и сайт» journal — per recipient, so the admin can see
     * exactly who did not get the broadcast and why.
     */
    private Outcome sendOne(long id, String html, InlineKeyboardMarkup markup, ActivityLog.Entry journal) {
        journal.toCustomer(id).text(html);
        if (id <= 0) {
            activity.record(journal.failed("BAD_RECIPIENT", "некорректный Telegram id"));
            return Outcome.FAILED;
        }
        try {
            SendMessage msg = SendMessage.builder()
                    .chatId(String.valueOf(id))
                    .text(html)
                    .parseMode("HTML")
                    .disableWebPagePreview(true)
                    .replyMarkup(markup)
                    .build();
            activity.bot(journal, () -> bot.execute(msg));
            return Outcome.OK;
        } catch (Exception e) {
            String m = e.getMessage() == null ? "" : e.getMessage().toLowerCase();
            if (m.contains("too many requests") || m.contains("retry after")) {
                sleep(1500);
            }
            if (m.contains("blocked") || m.contains("deactivated") || m.contains("chat not found")
                    || m.contains("user is deactivated") || m.contains("bot can't initiate")) {
                try {
                    audiences.markBotBlocked(id, clock.instant());
                } catch (Exception ignore) {
                    // best-effort
                }
                return Outcome.BLOCKED;
            }
            log.debug("broadcast send to {} failed: {}", id, m);
            return Outcome.FAILED;
        }
    }

    private List<Long> resolveAudience(String audience) {
        return audiences.ids(audience);
    }

    /** telegram id → uk/ru/en the customer reads (same rule as {@link Messages#localeOf}). */
    private Map<Long, String> languages() {
        Map<Long, String> out = new HashMap<>();
        for (BroadcastAudiences.Reachable r : audiences.reachable()) {
            out.put(r.telegramUserId(), langOf(r.locale(), r.languageCode()));
        }
        return out;
    }

    // ------------------------------------------------------------------ pure rules (unit-tested)

    /** Shop choice first, then the Telegram language, then the shop fallback (Ukrainian). */
    static String langOf(String locale, String languageCode) {
        Locale picked = Messages.normalize(locale);
        if (picked == null) {
            picked = Messages.normalize(languageCode);
        }
        return (picked == null ? Messages.FALLBACK : picked).getLanguage();
    }

    /** Audience ids → recipients with their language, narrowed to {@code lang} when given. */
    static List<Recipient> recipients(List<Long> ids, Map<Long, String> langs, String lang) {
        List<Recipient> out = new ArrayList<>(ids.size());
        for (Long id : ids) {
            String l = langs.getOrDefault(id, Messages.FALLBACK.getLanguage());
            if (lang == null || lang.equals(l)) {
                out.add(new Recipient(id, l));
            }
        }
        return out;
    }

    /** The version written for the recipient's language, else the main text. */
    static String textFor(String lang, String text, String uk, String ru, String en) {
        String v = switch (lang == null ? "" : lang) {
            case "uk" -> uk;
            case "ru" -> ru;
            case "en" -> en;
            default -> null;
        };
        return v == null || v.isBlank() ? text : v;
    }

    static String normLang(String lang) {
        if (lang == null || lang.isBlank()) {
            return null;
        }
        String l = lang.trim().toLowerCase(Locale.ROOT);
        return DEFAULT_BUTTON.containsKey(l) ? l : null;
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
