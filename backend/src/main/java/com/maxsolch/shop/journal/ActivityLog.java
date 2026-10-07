package com.maxsolch.shop.journal;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.security.AuthPrincipal;
import com.maxsolch.shop.security.Role;
import com.maxsolch.shop.web.SecurityUtil;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;
import org.telegram.telegrambots.meta.exceptions.TelegramApiRequestException;

import java.io.IOException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

import static com.maxsolch.shop.common.Texts.ellipsize;

/**
 * Журнал «Бот и сайт» ({@code activity_log}, V47): what the bot sent and to whom — delivered or
 * not, and why — plus what customers did on the website / in the Mini App, payment events and
 * background jobs. The admin action log ({@code admin_audit_log}) stays separate.
 *
 * <p>Writing is observability, never business logic: entries go to a single background worker
 * with a bounded queue (dropped, with a warning, if the database cannot keep up), every failure is
 * swallowed, and the caller's thread only builds a small object. Bot texts are stored as a short
 * plain-text preview; secrets (bot token in error texts, one-time links) never reach the table.
 */
@Slf4j
@Service
public class ActivityLog {

    // ---- sources
    public static final String BOT = "BOT";
    public static final String SITE = "SITE";
    public static final String MINIAPP = "MINIAPP";
    public static final String PAYMENT = "PAYMENT";
    public static final String SYSTEM = "SYSTEM";

    // ---- results
    public static final String OK = "OK";
    public static final String FAILED = "FAILED";
    public static final String SKIPPED = "SKIPPED";

    // ---- bot message recipients
    public static final String TO_CUSTOMER = "CUSTOMER";
    public static final String TO_ADMINS = "ADMINS";

    /** Group id of one broadcast's rows (one per recipient). */
    public static String broadcastGroup(long broadcastId) {
        return "broadcast:" + broadcastId;
    }

    private static final String INSERT = "INSERT INTO activity_log "
            + "(created_at, source, type, result, recipient, tg_user_id, chat_id, order_id, group_id, summary, "
            + "error_code, error, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

    private static final ObjectMapper JSON = new ObjectMapper();
    /** {@code bot123456:AA...} — a bot token inside an exception text (URLs of the Bot API). */
    private static final Pattern BOT_TOKEN = Pattern.compile("bot\\d{5,}:[A-Za-z0-9_-]{20,}");
    private static final Pattern HTML_TAG = Pattern.compile("<[^>]{1,200}>");

    private final JdbcTemplate jdbc;
    private final ExecutorService executor;
    private final AtomicLong dropped = new AtomicLong();

    @Autowired
    public ActivityLog(JdbcTemplate jdbc) {
        this(jdbc, newWorker());
    }

    ActivityLog(JdbcTemplate jdbc, ExecutorService executor) {
        this.jdbc = jdbc;
        this.executor = executor;
    }

    private static ExecutorService newWorker() {
        ThreadPoolExecutor ex = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS,
                new LinkedBlockingQueue<>(20_000), r -> {
            Thread t = new Thread(r, "activity-log");
            t.setDaemon(true);
            return t;
        });
        ex.setRejectedExecutionHandler((r, e) -> {
            throw new RejectedExecutionException("activity log queue is full");
        });
        return ex;
    }

    // ------------------------------------------------------------------ recording

    /** Queues the entry; never throws. */
    public void record(Entry e) {
        if (e == null) {
            return;
        }
        try {
            executor.execute(() -> write(e));
        } catch (RejectedExecutionException ex) {
            long n = dropped.incrementAndGet();
            if (n == 1 || n % 1000 == 0) {
                log.warn("Activity log queue is full — {} entries dropped so far", n);
            }
        } catch (RuntimeException ex) {
            log.debug("Activity log entry not queued: {}", ex.getMessage());
        }
    }

    /**
     * Inside a transaction: queues the entry only once it commits (a rolled-back payment or order
     * must not show up as done). Outside one: right away.
     */
    public void recordAfterCommit(Entry e) {
        if (e == null) {
            return;
        }
        try {
            if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
                org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                        new org.springframework.transaction.support.TransactionSynchronization() {
                            @Override
                            public void afterCommit() {
                                record(e);
                            }
                        });
                return;
            }
        } catch (RuntimeException ex) {
            log.debug("Activity log: no transaction synchronization ({})", ex.getMessage());
        }
        record(e);
    }

    /**
     * Runs one Telegram call and records how it went: OK, or FAILED with the classified reason.
     * The call's exception is re-thrown untouched, so the caller keeps its own handling.
     */
    public <T> T bot(Entry e, BotCall<T> call) throws TelegramApiException {
        try {
            T result = call.call();
            record(e.result(OK));
            return result;
        } catch (TelegramApiException ex) {
            record(e.failed(ex));
            throw ex;
        } catch (RuntimeException ex) {
            record(e.failed(ex));
            throw ex;
        }
    }

    /** A Telegram Bot API call. */
    @FunctionalInterface
    public interface BotCall<T> {
        T call() throws TelegramApiException;
    }

    void write(Entry e) {
        try {
            Long tgUserId = e.tgUserId;
            if (tgUserId == null && e.orderId != null && !TO_ADMINS.equals(e.recipient)) {
                tgUserId = orderCustomer(e.orderId);
            }
            jdbc.update(INSERT,
                    Timestamp.from(e.at),
                    e.source,
                    ellipsize(e.type, 48),
                    e.result == null ? OK : e.result,
                    e.recipient,
                    tgUserId,
                    e.chatId,
                    e.orderId,
                    ellipsize(e.groupId, 64),
                    ellipsize(e.summary, 500),
                    ellipsize(e.errorCode, 32),
                    ellipsize(e.error, 500),
                    detailsJson(e.details));
        } catch (Exception ex) {
            log.warn("Activity log write failed ({} {}): {}", e.source, e.type, ex.getMessage());
        }
    }

    private Long orderCustomer(byte[] orderId) {
        try {
            List<Long> ids = jdbc.queryForList("SELECT tg_user_id FROM orders WHERE id = ?", Long.class, orderId);
            return ids.isEmpty() ? null : ids.get(0);
        } catch (Exception ex) {
            return null;
        }
    }

    private static String detailsJson(Map<String, Object> details) {
        if (details == null || details.isEmpty()) {
            return null;
        }
        try {
            String s = JSON.writeValueAsString(details);
            return s.length() <= 2000 ? s : null;
        } catch (Exception ex) {
            return null;
        }
    }

    /** Lets queued entries land on shutdown (a few seconds at most). */
    @PreDestroy
    void shutdown() {
        executor.shutdown();
        try {
            executor.awaitTermination(5, TimeUnit.SECONDS);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }

    // ------------------------------------------------------------------ request context

    /**
     * Where the current customer request came from: {@link #SITE} for the website's cookie token,
     * {@link #MINIAPP} for the Mini App, {@link #SYSTEM} outside a customer request.
     */
    public static String requestSource() {
        try {
            AuthPrincipal p = SecurityUtil.currentPrincipal();
            if (p.role() != Role.CUSTOMER) {
                return SYSTEM;
            }
            return p.isWeb() ? SITE : MINIAPP;
        } catch (RuntimeException e) {
            return SYSTEM;
        }
    }

    /** Telegram id of the current customer, null outside a customer request. */
    public static Long requestUserId() {
        try {
            AuthPrincipal p = SecurityUtil.currentPrincipal();
            return p.role() == Role.CUSTOMER ? p.telegramUserId() : null;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** A customer action of the current request (source SITE / MINIAPP, customer filled in). */
    public static Entry fromRequest(String type) {
        return Entry.of(requestSource(), type).customer(requestUserId());
    }

    // ------------------------------------------------------------------ failure reasons

    /** Why a Telegram call failed: a stable code for filters + a readable, sanitised text. */
    public record Failure(String code, String message) {
    }

    public static Failure classify(Throwable t) {
        if (t == null) {
            return new Failure("ERROR", null);
        }
        Integer status = null;
        String api = null;
        Integer retryAfter = null;
        if (t instanceof TelegramApiRequestException r) {
            status = r.getErrorCode();
            api = r.getApiResponse();
            if (r.getParameters() != null) {
                retryAfter = r.getParameters().getRetryAfter();
            }
        }
        String text = (api != null ? api : String.valueOf(t.getMessage())).toLowerCase(Locale.ROOT);
        String full = (t.getMessage() == null ? "" : t.getMessage().toLowerCase(Locale.ROOT)) + " " + text;
        String code;
        if (Integer.valueOf(429).equals(status) || full.contains("too many requests") || full.contains("retry after")) {
            code = "RATE_LIMITED";
        } else if (full.contains("bot was blocked")) {
            code = "BOT_BLOCKED";
        } else if (full.contains("user is deactivated") || full.contains("deactivated")) {
            code = "USER_DEACTIVATED";
        } else if (full.contains("bot can't initiate")) {
            code = "NOT_STARTED";
        } else if (full.contains("chat not found")) {
            code = "CHAT_NOT_FOUND";
        } else if (full.contains("bot was kicked") || full.contains("not a member")) {
            code = "BOT_KICKED";
        } else if (full.contains("can't parse entities")) {
            code = "BAD_MARKUP";
        } else if (full.contains("message thread not found") || full.contains("topic_closed")
                || full.contains("topic_deleted")) {
            code = "TOPIC_NOT_FOUND";
        } else if (Integer.valueOf(403).equals(status) || full.contains("forbidden")) {
            code = "FORBIDDEN";
        } else if (Integer.valueOf(400).equals(status) || full.contains("bad request")) {
            code = "BAD_REQUEST";
        } else if (hasCause(t, IOException.class) || full.contains("unable to execute")
                || full.contains("timed out") || full.contains("connection")) {
            code = "NETWORK";
        } else {
            code = "ERROR";
        }
        StringBuilder msg = new StringBuilder();
        if (status != null) {
            msg.append('[').append(status).append("] ");
        }
        msg.append(api != null ? api : t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage());
        if (retryAfter != null) {
            msg.append(" (retry after ").append(retryAfter).append(" s)");
        }
        return new Failure(code, sanitize(msg.toString()));
    }

    private static boolean hasCause(Throwable t, Class<? extends Throwable> type) {
        for (Throwable c = t; c != null; c = c.getCause() == c ? null : c.getCause()) {
            if (type.isInstance(c)) {
                return true;
            }
        }
        return false;
    }

    /** Hides a bot token in an error text and trims it. */
    static String sanitize(String s) {
        if (s == null) {
            return null;
        }
        return ellipsize(BOT_TOKEN.matcher(s).replaceAll("bot***"), 500);
    }

    /** HTML message → one line of plain text for the preview. */
    static String plain(String html) {
        if (html == null) {
            return null;
        }
        String s = HTML_TAG.matcher(html).replaceAll(" ")
                .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&amp;", "&");
        s = s.replaceAll("\\s+", " ").trim();
        return s.isEmpty() ? null : ellipsize(s, 500);
    }

    // ------------------------------------------------------------------ entry

    /** One journal row, built fluently by the caller. */
    public static final class Entry {
        final Instant at = Instant.now();
        final String source;
        final String type;
        String result = OK;
        String recipient;
        Long tgUserId;
        Long chatId;
        byte[] orderId;
        String groupId;
        String summary;
        String errorCode;
        String error;
        Map<String, Object> details;

        private Entry(String source, String type) {
            this.source = source;
            this.type = type;
        }

        public static Entry of(String source, String type) {
            return new Entry(source, type);
        }

        /** A message the bot sends. */
        public static Entry bot(String type) {
            return new Entry(BOT, type);
        }

        /** The customer this is about (no recipient change). */
        public Entry customer(Long tgUserId) {
            this.tgUserId = tgUserId != null && tgUserId > 0 ? tgUserId : null;
            return this;
        }

        /** A bot DM to the customer: they are both the recipient chat and the customer. */
        public Entry toCustomer(Long tgUserId) {
            customer(tgUserId);
            this.recipient = TO_CUSTOMER;
            this.chatId = this.tgUserId;
            return this;
        }

        /** A bot message to the admins (their group/topic or an admin's DM). */
        public Entry toAdmins(String chatId) {
            this.recipient = TO_ADMINS;
            try {
                this.chatId = chatId == null || chatId.isBlank() ? null : Long.parseLong(chatId.trim());
            } catch (NumberFormatException e) {
                this.chatId = null; // @channelusername — nothing numeric to keep
            }
            return this;
        }

        public Entry order(byte[] orderId) {
            this.orderId = orderId != null && orderId.length == 16 ? orderId : null;
            return this;
        }

        public Entry order(String orderId) {
            try {
                return order(orderId == null ? null : UuidUtil.toBytes(orderId));
            } catch (IllegalArgumentException e) {
                return this;
            }
        }

        public Entry group(String groupId) {
            this.groupId = groupId;
            return this;
        }

        /** Plain-text preview (HTML is stripped). */
        public Entry text(String html) {
            this.summary = plain(html);
            return this;
        }

        public Entry result(String result) {
            this.result = result;
            return this;
        }

        public Entry skipped(String why) {
            this.result = SKIPPED;
            this.errorCode = why;
            return this;
        }

        public Entry failed(String code, String message) {
            this.result = FAILED;
            this.errorCode = code;
            this.error = sanitize(message);
            return this;
        }

        public Entry failed(Throwable t) {
            Failure f = classify(t);
            return failed(f.code(), f.message());
        }

        /**
         * A customer request the shop refused (400/409 …): the API error code when there is one
         * (PAYMENT_EXPIRED, PAID_NEEDS_REQUEST, PROMO_REJECTED …) and the message the customer saw.
         */
        public Entry rejected(Throwable t) {
            String code = null;
            if (t instanceof com.maxsolch.shop.web.ConflictException c) {
                code = c.getCode();
            } else if (t instanceof com.maxsolch.shop.web.BadRequestException b) {
                code = b.getCode();
            } else if (t instanceof com.maxsolch.shop.web.TooManyRequestsException m) {
                code = m.getCode();
            } else if (t instanceof org.springframework.web.server.ResponseStatusException r) {
                code = "HTTP_" + r.getStatusCode().value();
            }
            if (code == null || code.isBlank()) {
                code = t instanceof com.maxsolch.shop.web.BadRequestException ? "BAD_REQUEST"
                        : t instanceof com.maxsolch.shop.web.ConflictException ? "CONFLICT" : "ERROR";
            }
            String message = t instanceof org.springframework.web.server.ResponseStatusException r
                    ? r.getReason() : t.getMessage();
            return failed(code, message);
        }

        public Entry detail(String key, Object value) {
            if (value != null) {
                if (details == null) {
                    details = new LinkedHashMap<>();
                }
                details.put(key, value instanceof Instant || value instanceof Enum<?> ? value.toString() : value);
            }
            return this;
        }

        // read access for tests / callers
        public String source() {
            return source;
        }

        public String type() {
            return type;
        }

        public String resultCode() {
            return result;
        }

        public String errorCode() {
            return errorCode;
        }

        public String summary() {
            return summary;
        }

        public Long tgUserId() {
            return tgUserId;
        }

        public String groupId() {
            return groupId;
        }

        public Map<String, Object> details() {
            return details;
        }
    }
}
