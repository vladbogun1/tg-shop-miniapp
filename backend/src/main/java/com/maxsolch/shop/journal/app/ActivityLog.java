package com.maxsolch.shop.journal.app;

import com.maxsolch.shop.journal.infra.ActivityLogStore;
import com.maxsolch.shop.journal.domain.ActivityRow;
import com.maxsolch.shop.journal.domain.BotFailure;
import com.maxsolch.shop.journal.domain.EntryCommitted;
import com.maxsolch.shop.journal.domain.BotFailureClassifier;
import com.maxsolch.shop.journal.domain.JournalText;
import com.maxsolch.shop.platform.jobs.Workers;
import java.time.Clock;
import java.time.Duration;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.platform.security.AuthPrincipal;
import com.maxsolch.shop.platform.security.Role;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.platform.tx.OnCommitted;
import com.maxsolch.shop.platform.web.CurrentActor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

import static com.maxsolch.shop.platform.util.Texts.ellipsize;

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


    private final ActivityLogStore store;
    private final BotFailureClassifier classifier;
    private final DomainEvents events;
    private final CurrentActor actor;
    private final ExecutorService executor;
    private final Clock clock;
    private final AtomicLong dropped = new AtomicLong();

    @Autowired
    public ActivityLog(ActivityLogStore store, BotFailureClassifier classifier, DomainEvents events,
                       CurrentActor actor, Clock clock, Workers workers) {
        this(store, classifier, events, actor, clock, workers.bounded("activity-log", 20_000,
                (r, e) -> {
                    throw new RejectedExecutionException("activity log queue is full");
                }, Duration.ofSeconds(5)));
    }

    ActivityLog(ActivityLogStore store, BotFailureClassifier classifier, DomainEvents events, CurrentActor actor,
                Clock clock, ExecutorService executor) {
        this.clock = clock;
        this.store = store;
        this.classifier = classifier;
        this.events = events;
        this.actor = actor;
        this.executor = executor;
    }

    // ------------------------------------------------------------------ recording

    /** Queues the entry; never throws. */
    public void record(Entry e) {
        if (e == null) {
            return;
        }
        stamp(e);
        enqueue(e.toRow());
    }

    private void enqueue(ActivityRow row) {
        try {
            executor.execute(() -> write(row));
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
     * must not show up as done). Outside one: right away. The entry rides a domain event
     * ({@link DomainEvents}); on rollback the listener never runs, exactly like the old afterCommit hook.
     */
    public void recordAfterCommit(Entry e) {
        if (e == null) {
            return;
        }
        stamp(e);
        try {
            events.publish(new EntryCommitted(e.toRow()));
        } catch (RuntimeException ex) {
            log.debug("Activity log: entry not published ({})", ex.getMessage());
            record(e);
        }
    }

    @OnCommitted
    public void onCommitted(EntryCommitted event) {
        enqueue(event.row());
    }

    /**
     * Runs one bot call and records how it went: OK, or FAILED with the classified reason
     * ({@link BotFailureClassifier}). The call's exception is re-thrown untouched, so the caller keeps its own handling.
     */
    public <T, X extends Exception> T bot(Entry e, BotCall<T, X> call) throws X {
        try {
            T result = call.call();
            record(e.result(OK));
            return result;
        } catch (Exception ex) {
            record(e.failed(classifier.classify(ex)));
            throw ex;
        }
    }

    /** A bot (Telegram Bot API) call. */
    @FunctionalInterface
    public interface BotCall<T, X extends Exception> {
        T call() throws X;
    }

    /** The moment of the event: set when the entry is handed over, not when its transaction commits. */
    private void stamp(Entry e) {
        if (e.at == null) {
            e.at = clock.instant();
        }
    }

    void write(ActivityRow row) {
        try {
            store.write(row);
        } catch (Exception ex) {
            log.warn("Activity log write failed ({} {}): {}", row.source(), row.type(), ex.getMessage());
        }
    }

    // ------------------------------------------------------------------ request context

    /**
     * Where the current customer request came from: {@link #SITE} for the website's cookie token,
     * {@link #MINIAPP} for the Mini App, {@link #SYSTEM} outside a customer request.
     */
    public String requestSource() {
        try {
            AuthPrincipal p = actor.principal();
            if (p.role() != Role.CUSTOMER) {
                return SYSTEM;
            }
            return p.isWeb() ? SITE : MINIAPP;
        } catch (RuntimeException e) {
            return SYSTEM;
        }
    }

    /** Telegram id of the current customer, null outside a customer request. */
    public Long requestUserId() {
        try {
            AuthPrincipal p = actor.principal();
            return p.role() == Role.CUSTOMER ? p.telegramUserId() : null;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** A customer action of the current request (source SITE / MINIAPP, customer filled in). */
    public Entry fromRequest(String type) {
        return Entry.of(requestSource(), type).customer(requestUserId());
    }

    // ------------------------------------------------------------------ entry

    /** One journal row, built fluently by the caller. */
    public static final class Entry {
        /** Set by {@link ActivityLog} when the entry is recorded. */
        Instant at;
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
            this.summary = JournalText.plain(html);
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
            this.error = JournalText.sanitize(message);
            return this;
        }

        public Entry failed(BotFailure f) {
            return failed(f.code(), f.message());
        }

        /**
         * A customer request the shop refused (400/409 …): the API error code when there is one
         * (PAYMENT_EXPIRED, PAID_NEEDS_REQUEST, PROMO_REJECTED …) and the message the customer saw.
         */
        public Entry rejected(Throwable t) {
            String code = null;
            if (t instanceof com.maxsolch.shop.platform.error.DomainException.Conflict c) {
                code = c.getCode();
            } else if (t instanceof com.maxsolch.shop.platform.error.DomainException.BadRequest b) {
                code = b.getCode();
            } else if (t instanceof com.maxsolch.shop.platform.error.DomainException.TooManyRequests m) {
                code = m.getCode();
            }
            if (code == null || code.isBlank()) {
                code = t instanceof com.maxsolch.shop.platform.error.DomainException.BadRequest ? "BAD_REQUEST"
                        : t instanceof com.maxsolch.shop.platform.error.DomainException.Conflict ? "CONFLICT" : "ERROR";
            }
            return failed(code, t.getMessage());
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

        ActivityRow toRow() {
            return new ActivityRow(at, source, type, result, recipient, tgUserId, chatId, orderId, groupId, summary,
                    errorCode, error, details);
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
