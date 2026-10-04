package com.maxsolch.shop.inbox;

import com.maxsolch.shop.analytics.AnalyticsZone;
import com.maxsolch.shop.analytics.metrics.AdminMetricsService;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.ReorderRow;
import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.inbox.InboxDtos.DismissRequest;
import com.maxsolch.shop.inbox.InboxDtos.Inbox;
import com.maxsolch.shop.inbox.InboxDtos.RestoreRequest;
import com.maxsolch.shop.inbox.InboxDtos.SnoozeRequest;
import com.maxsolch.shop.inbox.InboxDtos.SnoozeResult;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import com.maxsolch.shop.site.SiteRevalidator;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.SecurityUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;

/**
 * The admin «Внимание» screen: everything waiting for the owner, in one place.
 *
 * <p>Rows are computed on every request from orders, chats, stock and the site's rebuild status
 * ({@link InboxRules}); only the owner's «Отложить» / «Разобрано» marks are stored.
 */
@Slf4j
@Service
public class InboxService {

    /** «Отложить»: the three choices the UI offers. */
    public enum SnoozePreset {
        HOUR,
        /** Until 9:00 shop time — tomorrow's, or today's when it is still night. */
        TOMORROW,
        DAYS3
    }

    /** Before this hour «до завтра 9:00» means this morning: it is still night. */
    static final int NIGHT_ENDS_HOUR = 5;
    static final LocalTime MORNING = LocalTime.of(9, 0);
    private static final int MAX_ID = 80;
    private static final int MAX_VERSION = 64;

    private final InboxStore store;
    private final AdminMetricsService metrics;
    private final SiteRevalidator site;
    private final SettingsService settings;
    private final AdminAuditService audit;
    private final ZoneId zone;

    public InboxService(InboxStore store, AdminMetricsService metrics, SiteRevalidator site,
                        SettingsService settings, AdminAuditService audit, AppProperties props) {
        this.store = store;
        this.metrics = metrics;
        this.site = site;
        this.settings = settings;
        this.audit = audit;
        this.zone = AnalyticsZone.of(props);
    }

    /**
     * Not transactional on purpose: plain reads, and a failing stock calculation (its own
     * transactional loader) must not mark a shared transaction rollback-only.
     */
    public Inbox inbox() {
        Instant now = Instant.now();
        InboxRules.Thresholds t = new InboxRules.Thresholds(
                settings.getInt(SettingsRegistry.INBOX_NEW_STALE_HOURS),
                settings.getInt(SettingsRegistry.INBOX_APPROVED_STALE_HOURS));
        InboxFacts facts = new InboxFacts(now,
                store.candidateOrders(
                        now.minus(Duration.ofHours(t.newStaleHours())),
                        now.minus(Duration.ofHours(t.approvedStaleHours())),
                        now.minus(Duration.ofDays(InboxRules.RETURNS_DAYS))),
                store.unreadChats(),
                runningOut(),
                site.status());
        return InboxRules.build(facts, store.marks(), t);
    }

    /** «Отложить»: hides the row until the preset time, or until its event changes. */
    @Transactional
    public SnoozeResult snooze(SnoozeRequest req) {
        if (req == null) {
            throw new BadRequestException("Пустой запрос");
        }
        InboxItemType type = type(req.type());
        String entityId = entityId(req.entityId());
        String version = version(req.version());
        SnoozePreset preset;
        try {
            preset = SnoozePreset.valueOf(req.preset() == null ? "" : req.preset().trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Неизвестный срок: " + req.preset(), "INBOX_BAD_PRESET");
        }
        Instant now = Instant.now();
        Instant until = until(preset, now, zone);
        store.purge(now.minus(Duration.ofDays(1)), now.minus(Duration.ofDays(90)));
        store.upsert(new InboxMark(type, entityId, version, InboxMark.Kind.SNOOZED, until),
                currentAdminId(), audit.currentAdminName());
        return new SnoozeResult(until);
    }

    /** «Разобрано» (informational rows only); written to the admin journal. */
    @Transactional
    public void dismiss(DismissRequest req) {
        if (req == null) {
            throw new BadRequestException("Пустой запрос");
        }
        InboxItemType type = type(req.type());
        if (!type.dismissible()) {
            throw new BadRequestException("Эту строку можно только отложить — она уйдёт сама, когда заказ обработают",
                    "INBOX_NOT_DISMISSIBLE");
        }
        String entityId = entityId(req.entityId());
        String version = version(req.version());
        Instant now = Instant.now();
        store.purge(now.minus(Duration.ofDays(1)), now.minus(Duration.ofDays(90)));
        store.upsert(new InboxMark(type, entityId, version, InboxMark.Kind.DISMISSED, null),
                currentAdminId(), audit.currentAdminName());
        audit.record("INBOX_DISMISS", type.auditEntityType(), auditEntityId(type, entityId),
                "«Внимание» → " + type.title() + ": разобрано" + orderSuffix(type, entityId));
    }

    /** Undo of «Отложить» / «Разобрано»: the row is back right away. */
    @Transactional
    public void restore(RestoreRequest req) {
        if (req == null) {
            throw new BadRequestException("Пустой запрос");
        }
        InboxItemType type = type(req.type());
        String entityId = entityId(req.entityId());
        InboxMark removed = store.delete(type, entityId);
        if (removed != null && removed.kind() == InboxMark.Kind.DISMISSED) {
            audit.record("INBOX_RESTORE", type.auditEntityType(), auditEntityId(type, entityId),
                    "«Внимание» → " + type.title() + ": возвращено" + orderSuffix(type, entityId));
        }
    }

    // ------------------------------------------------------------------ helpers

    /** End of a snooze started at {@code now}. */
    static Instant until(SnoozePreset preset, Instant now, ZoneId zone) {
        return switch (preset) {
            case HOUR -> now.plus(Duration.ofHours(1));
            case DAYS3 -> now.plus(Duration.ofDays(3));
            case TOMORROW -> {
                ZonedDateTime local = now.atZone(zone);
                LocalDate day = local.getHour() < NIGHT_ENDS_HOUR ? local.toLocalDate() : local.toLocalDate().plusDays(1);
                yield day.atTime(MORNING).atZone(zone).toInstant();
            }
        };
    }

    private List<ReorderRow> runningOut() {
        try {
            return metrics.runningOut();
        } catch (Exception e) {
            // Stock is the least urgent group: a metrics failure must not take the whole screen down.
            log.warn("Inbox: running-out stock unavailable: {}", e.getMessage());
            return List.of();
        }
    }

    private static InboxItemType type(String raw) {
        InboxItemType type = InboxItemType.parse(raw);
        if (type == null) {
            throw new BadRequestException("Неизвестный тип строки: " + raw, "INBOX_BAD_TYPE");
        }
        return type;
    }

    private static String entityId(String raw) {
        if (raw == null || raw.isBlank() || raw.length() > MAX_ID) {
            throw new BadRequestException("Не указано, к чему относится строка", "INBOX_BAD_ENTITY");
        }
        return raw.trim();
    }

    private static String version(String raw) {
        if (raw == null || raw.isBlank() || raw.length() > MAX_VERSION) {
            throw new BadRequestException("Не указана версия строки — обновите экран", "INBOX_BAD_VERSION");
        }
        return raw.trim();
    }

    /** Product rows are {@code productId[:variantId]}; the journal links to the product. */
    private static String auditEntityId(InboxItemType type, String entityId) {
        if ("PRODUCT".equals(type.auditEntityType())) {
            int colon = entityId.indexOf(':');
            return colon < 0 ? entityId : entityId.substring(0, colon);
        }
        return "SITE".equals(type.auditEntityType()) ? null : entityId;
    }

    private static String orderSuffix(InboxItemType type, String entityId) {
        return "ORDER".equals(type.auditEntityType()) ? " (заказ #" + InboxRules.shortId(entityId) + ")" : "";
    }

    private static Long currentAdminId() {
        try {
            return SecurityUtil.currentUserId();
        } catch (Exception e) {
            return null;
        }
    }
}
