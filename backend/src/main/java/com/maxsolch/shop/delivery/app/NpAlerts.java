package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.settings.app.SettingsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Problems of the Nova Poshta integration itself — not of one parcel — kept as system keys
 * ({@code system.np.alert.<kind>} = {@code <since epoch ms>|<text>}) and shown on «Внимание» → «Новая почта: сбои»
 * (the inbox module reads {@link #current()}): the directory sync or the tracking poll failing, status codes or
 * branch types NP added that the shop does not know, the sender's branch closed, NP charging other than our
 * estimate. A kind clears itself when the job next succeeds; «Разобрано» hides the current text (the version is the
 * time it was first raised, so a new problem comes back).
 */
@Slf4j
@Component
public class NpAlerts {

    private static final String PREFIX = "np.alert.";
    static final int MAX_TEXT = 480;

    /** One alert per kind; the declaration order is the order on the screen. */
    public enum Kind {
        SENDER_BRANCH("Отделение отправки", true),
        POLL("Отслеживание посылок", true),
        SYNC("Справочник отделений", false),
        STATUS_CODES("Новые статусы Новой почты", false),
        WAREHOUSE_TYPES("Новые типы отделений", false),
        TARIFF("Цена доставки", false),
        WEBHOOK("Вебхуки Новой почты", false);

        private final String title;
        private final boolean urgent;

        Kind(String title, boolean urgent) {
            this.title = title;
            this.urgent = urgent;
        }

        public String title() {
            return title;
        }

        /** Shown as overdue on «Внимание». */
        public boolean urgent() {
            return urgent;
        }
    }

    /** One raised alert. */
    public record Alert(Kind kind, Instant since, String text) {
    }

    private final SettingsService settings;
    private final Clock clock;

    public NpAlerts(SettingsService settings, Clock clock) {
        this.settings = settings;
        this.clock = clock;
    }

    /** Raises (or rewords) an alert; the «since» of an alert already up stays. */
    public void raise(Kind kind, String text) {
        String t = text == null || text.isBlank() ? kind.title : text.trim();
        if (t.length() > MAX_TEXT) {
            t = t.substring(0, MAX_TEXT) + "…";
        }
        Optional<Alert> cur = get(kind);
        if (cur.isPresent() && cur.get().text().equals(t)) {
            return;
        }
        long since = cur.map(a -> a.since().toEpochMilli()).orElse(clock.millis());
        log.warn("NP alert {}: {}", kind, t);
        settings.putSystem(PREFIX + kind.name(), since + "|" + t);
    }

    /** The job that raised it works again. */
    public void clear(Kind kind) {
        if (get(kind).isPresent()) {
            settings.putSystem(PREFIX + kind.name(), "");
        }
    }

    public Optional<Alert> get(Kind kind) {
        return settings.system(PREFIX + kind.name()).flatMap(raw -> parse(kind, raw));
    }

    /** Every alert that is up, in the screen's order. */
    public List<Alert> current() {
        List<Alert> out = new ArrayList<>();
        for (Kind k : Kind.values()) {
            get(k).ifPresent(out::add);
        }
        return out;
    }

    static Optional<Alert> parse(Kind kind, String raw) {
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }
        int bar = raw.indexOf('|');
        try {
            long since = Long.parseLong(bar < 0 ? raw : raw.substring(0, bar));
            return Optional.of(new Alert(kind, Instant.ofEpochMilli(since),
                    bar < 0 ? kind.title : raw.substring(bar + 1)));
        } catch (NumberFormatException e) {
            return Optional.of(new Alert(kind, Instant.EPOCH, raw));
        }
    }
}
