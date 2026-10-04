package com.maxsolch.shop.inbox;

import java.time.Instant;

/**
 * The owner's mark on one inbox row ({@code inbox_marks}).
 *
 * @param version event version at the time of marking; a row whose current version differs is
 *                shown again regardless of the mark
 * @param until   end of a snooze; null for {@link Kind#DISMISSED}
 */
public record InboxMark(InboxItemType type, String entityId, String version, Kind kind, Instant until) {

    public enum Kind {
        SNOOZED,
        DISMISSED
    }

    /** Whether this mark hides a row with the given current version at {@code now}. */
    public boolean hides(String currentVersion, Instant now) {
        if (version == null || !version.equals(currentVersion)) {
            return false;
        }
        return kind == Kind.DISMISSED || (until != null && until.isAfter(now));
    }

    public boolean snoozedAt(Instant now) {
        return kind == Kind.SNOOZED && until != null && until.isAfter(now);
    }

    public static String key(InboxItemType type, String entityId) {
        return type.name() + ":" + entityId;
    }
}
