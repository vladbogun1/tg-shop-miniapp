package com.maxsolch.shop.service;

import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.tg.ShopBot;
import com.maxsolch.shop.web.dto.BroadcastResult;
import com.maxsolch.shop.web.dto.BroadcastStatus;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.api.objects.webapp.WebAppInfo;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Sends HTML-formatted Telegram broadcasts to a chosen audience. One broadcast runs at a time
 * on a single background thread; progress is exposed via {@link #status()} for the admin UI to poll.
 * A send that hits "bot blocked / user deactivated" marks the user blocked (so the Users tab shows it).
 */
@Slf4j
@Service
public class BroadcastService {

    private enum Outcome { OK, BLOCKED, FAILED }

    private final ShopBot bot;
    private final AppProperties props;
    private final UserRepository userRepository;

    private final ExecutorService exec = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "broadcast");
        t.setDaemon(true);
        return t;
    });
    private final AtomicReference<BroadcastStatus> status = new AtomicReference<>(BroadcastStatus.idle());

    public BroadcastService(@Lazy ShopBot bot, AppProperties props, UserRepository userRepository) {
        this.bot = bot;
        this.props = props;
        this.userRepository = userRepository;
    }

    private boolean enabled() {
        String token = props.getTelegram().getBotToken();
        return token != null && !token.isBlank();
    }

    public BroadcastStatus status() {
        return status.get();
    }

    /** Audience sizes for the compose UI. */
    public java.util.Map<String, Integer> audienceCounts() {
        return java.util.Map.of(
                "all", userRepository.audienceAll().size(),
                "active", userRepository.audienceActive().size(),
                "inactive", userRepository.audienceInactive().size(),
                "premium", userRepository.audiencePremium().size());
    }

    /** Start a broadcast (async). Throws 409 if one is already running. */
    public synchronized BroadcastStatus start(String text, String audience, boolean withButton, String buttonText) {
        if (!enabled()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Бот не настроен");
        }
        if (status.get().running()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Рассылка уже идёт");
        }
        List<Long> ids = resolveAudience(audience);
        BroadcastStatus start = new BroadcastStatus(true, ids.size(), 0, 0, 0, Instant.now(), null);
        status.set(start);
        final String html = text;
        final InlineKeyboardMarkup markup = shopButton(withButton, buttonText);
        exec.submit(() -> run(html, ids, markup));
        return start;
    }

    /** Optional "open the shop" web_app button (private chats only; needs an HTTPS webapp URL). */
    private InlineKeyboardMarkup shopButton(boolean withButton, String buttonText) {
        if (!withButton) {
            return null;
        }
        String webapp = props.getWebappBaseUrl();
        if (webapp == null || !webapp.startsWith("https://")) {
            return null; // Telegram rejects non-HTTPS web_app buttons → skip rather than fail the send
        }
        String label = (buttonText == null || buttonText.isBlank()) ? "🛍 Открыть магазин" : buttonText.trim();
        InlineKeyboardButton btn = InlineKeyboardButton.builder()
                .text(label)
                .webApp(WebAppInfo.builder().url(webapp).build())
                .build();
        return InlineKeyboardMarkup.builder().keyboard(List.of(List.of(btn))).build();
    }

    private void run(String html, List<Long> ids, InlineKeyboardMarkup markup) {
        int sent = 0, failed = 0, blocked = 0;
        try {
            for (Long id : ids) {
                Outcome o = sendOne(id, html, markup);
                switch (o) {
                    case OK -> sent++;
                    case BLOCKED -> blocked++;
                    case FAILED -> failed++;
                }
                status.set(new BroadcastStatus(true, ids.size(), sent, failed, blocked,
                        status.get().startedAt(), null));
                sleep(45); // ~22 msg/s — well under Telegram's bulk limit
            }
        } finally {
            status.set(new BroadcastStatus(false, ids.size(), sent, failed, blocked,
                    status.get().startedAt(), Instant.now()));
            log.info("Broadcast finished: total={} sent={} failed={} blocked={}", ids.size(), sent, failed, blocked);
        }
    }

    /** Send one test message to a specific user. */
    public BroadcastResult test(String text, long telegramUserId, boolean withButton, String buttonText) {
        if (!enabled()) {
            return new BroadcastResult(false, "Бот не настроен");
        }
        Outcome o = sendOne(telegramUserId, text, shopButton(withButton, buttonText));
        return switch (o) {
            case OK -> new BroadcastResult(true, "Отправлено");
            case BLOCKED -> new BroadcastResult(false, "Пользователь заблокировал бота");
            case FAILED -> new BroadcastResult(false, "Не удалось отправить (проверьте текст/ID)");
        };
    }

    private Outcome sendOne(long id, String html, InlineKeyboardMarkup markup) {
        if (id <= 0) {
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
            bot.execute(msg);
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

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
