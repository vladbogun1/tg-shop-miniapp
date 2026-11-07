package com.maxsolch.shop.ai.domain;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** What an application of an AI result changed, and the two rules built on it (pure functions, no database). */
public final class ApplyDiff {

    /** The fields «Принять безопасное» may fill: no title, category or brand — only what is empty and can be given back. */
    private static final String SPEC = "spec:";
    private static final Set<String> SAFE_PLAIN = Set.of("description");
    /**
     * Bookkeeping the import does on its own when it writes a card (the work status, the confidence and the journal
     * of the card): not a promise of the safe acceptance, given back by the undo all the same.
     */
    private static final Set<String> BOOKKEEPING = Set.of("status", "confidence", "meta");

    private ApplyDiff() {
    }

    /** The fields that differ between the snapshot before and the one after (an absent field is empty). */
    public static Map<String, FieldChange> diff(Map<String, String> before, Map<String, String> after) {
        Map<String, FieldChange> out = new LinkedHashMap<>();
        Map<String, String> keys = new LinkedHashMap<>(before);
        after.forEach(keys::putIfAbsent);
        for (String key : keys.keySet()) {
            String b = before.get(key);
            String a = after.get(key);
            if (!Objects.equals(b, a)) {
                out.put(key, new FieldChange(b, a));
            }
        }
        return out;
    }

    /**
     * The fields among {@code changes} that break the promise of the safe acceptance: it replaced a filled value or
     * touched something that is not a characteristic or the description. Empty = the application was safe.
     */
    public static Map<String, FieldChange> violations(Map<String, FieldChange> changes) {
        Map<String, FieldChange> bad = new LinkedHashMap<>();
        changes.forEach((key, c) -> {
            if (BOOKKEEPING.contains(key)) {
                return;
            }
            boolean allowedKey = key.startsWith(SPEC) || SAFE_PLAIN.contains(key);
            if (!allowedKey || c.before() != null || c.after() == null) {
                bad.put(key, c);
            }
        });
        return bad;
    }

    /**
     * The changes of a later step of the same application (photos added after the card was saved, «Сохранить цену и
     * выложить») added to the ones recorded: a key already there keeps its «before» and takes the new «after»; a key
     * whose value went back to its «before» is dropped.
     */
    public static Map<String, FieldChange> merge(Map<String, FieldChange> recorded, Map<String, FieldChange> step) {
        Map<String, FieldChange> out = new LinkedHashMap<>(recorded);
        step.forEach((key, c) -> {
            FieldChange old = out.get(key);
            String before = old == null ? c.before() : old.before();
            if (Objects.equals(before, c.after())) {
                out.remove(key);
            } else {
                out.put(key, new FieldChange(before, c.after()));
            }
        });
        return out;
    }

    /** The fields that can be given back now: the current value is still what the application wrote. */
    public static Map<String, FieldChange> revertable(Map<String, FieldChange> changes, Map<String, String> current) {
        Map<String, FieldChange> out = new LinkedHashMap<>();
        changes.forEach((key, c) -> {
            if (Objects.equals(current.get(key), c.after())) {
                out.put(key, c);
            }
        });
        return out;
    }
}
