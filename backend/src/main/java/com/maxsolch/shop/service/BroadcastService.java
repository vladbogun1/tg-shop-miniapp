package com.maxsolch.shop.service;

import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.Broadcast;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.journal.ActivityLog;
import com.maxsolch.shop.repository.BroadcastRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.tg.ShopBot;
import com.maxsolch.shop.web.dto.BroadcastHistoryDto;
import com.maxsolch.shop.web.dto.BroadcastRequest;
import com.maxsolch.shop.web.dto.BroadcastResult;
import com.maxsolch.shop.web.dto.BroadcastStatus;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.api.objects.webapp.WebAppInfo;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

import static com.maxsolch.shop.common.Texts.blankToNull;

/**
 * Sends HTML-formatted Telegram broadcasts to a chosen audience. One broadcast runs at a time
 * on a single background thread; progress is exposed via {@link #status()} for the admin UI to poll.
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

    private static final Map<String, String> DEFAULT_BUTTON = Map.of(
            "uk", "🛍 Відкрити магазин",
            "ru", "🛍 Открыть магазин",
            "en", "🛍 Open the shop");

    private final ShopBot bot;
    private final AppProperties props;
    private final UserRepository userRepository;
    private final BroadcastRepository broadcastRepository;
    private final ActivityLog activity;

    private final ExecutorService exec = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "broadcast");
        t.setDaemon(true);
        return t;
    });
    private final AtomicReference<BroadcastStatus> status = new AtomicReference<>(BroadcastStatus.idle());

    public BroadcastService(@Lazy ShopBot bot, AppProperties props, UserRepository userRepository,
                            BroadcastRepository broadcastRepository, ActivityLog activity) {
        this.bot = bot;
        this.props = props;
        this.userRepository = userRepository;
        this.broadcastRepository = broadcastRepository;
        this.activity = activity;
    }

    /** A RUNNING history row after a restart was cut off mid-send — say so instead of "running". */
    @EventListener(ApplicationReadyEvent.class)
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
                    "all", userRepository.audienceAllCount(),
                    "active", userRepository.audienceActiveCount(),
                    "inactive", userRepository.audienceInactiveCount(),
                    "premium", userRepository.audiencePremiumCount());
        }
        Map<Long, String> langs = languages();
        Map<String, Long> out = new LinkedHashMap<>();
        for (String a : List.of("all", "active", "inactive", "premium")) {
            out.put(a, resolveAudience(a).stream().filter(id -> l.equals(langs.get(id))).count());
        }
        return out;
    }

    /** Start a broadcast (async). Throws 409 if one is already running. Returns the history id too. */
    public synchronized Started start(BroadcastRequest req, Long adminId, String adminName) {
        if (!enabled()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Бот не настроен");
        }
        if (status.get().running()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Рассылка уже идёт");
        }
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
        row.setStartedAt(Instant.now());
        Broadcast saved = broadcastRepository.save(row);

        BroadcastStatus start = new BroadcastStatus(true, recipients.size(), 0, 0, 0, saved.getStartedAt(), null);
        status.set(start);
        exec.submit(() -> run(saved, recipients, req.withButton(), req.buttonText()));
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

    private void run(Broadcast row, List<Recipient> recipients, boolean withButton, String buttonText) {
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
                }
                sleep(45); // ~22 msg/s — well under Telegram's bulk limit
            }
        } finally {
            Instant end = Instant.now();
            status.set(new BroadcastStatus(false, recipients.size(), sent, failed, blocked,
                    status.get().startedAt(), end));
            persist(row, sent, failed, blocked, Broadcast.DONE, end);
            log.info("Broadcast #{} finished: total={} sent={} failed={} blocked={}",
                    row.getId(), recipients.size(), sent, failed, blocked);
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
                    userRepository.markBotBlocked(id, Instant.now());
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
        String a = audience == null ? "all" : audience.trim().toLowerCase();
        return switch (a) {
            case "active" -> userRepository.audienceActive();
            case "inactive" -> userRepository.audienceInactive();
            case "premium" -> userRepository.audiencePremium();
            default -> userRepository.audienceAll();
        };
    }

    /** telegram id → uk/ru/en the customer reads (same rule as {@link Messages#localeOf}). */
    private Map<Long, String> languages() {
        Map<Long, String> out = new HashMap<>();
        for (Object[] r : userRepository.reachableLanguages()) {
            out.put(((Number) r[0]).longValue(), langOf((String) r[1], (String) r[2]));
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
