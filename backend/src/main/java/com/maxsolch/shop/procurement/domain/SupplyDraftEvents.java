package com.maxsolch.shop.procurement.domain;

import java.util.List;
import java.util.Map;

/** What happens to a supply draft that others act on after the commit (the push, the photos of new products). */
public final class SupplyDraftEvents {

    private SupplyDraftEvents() {
    }

    /** All steps are done: the admin who started it is asked to check. */
    public record Ready(long draftId, long adminId, String title, int lines, int newProducts) {
    }

    /** The batch was created; {@code photos} — new product id → links the AI found for its pictures. */
    public record Accepted(long draftId, long batchId, Map<String, List<String>> photos) {
    }
}
