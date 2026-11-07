package com.maxsolch.shop.ai.domain;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The port through which the AI module reads and gives back the fields of the object a task is about (a product card):
 * the {@code ai} module knows no catalog, the catalog implements this. Keys are the screen's field keys
 * ({@code description}, {@code spec:dpi}); a value is the canonical text of the field, an empty field is absent.
 */
public interface SubjectFields {

    /** The kind of object this port serves, the same as {@code ai_jobs.subject_type}. */
    String subjectType();

    /** The fields of the object as they are now. */
    Map<String, String> snapshot(String subjectId);

    /**
     * What an application of a result may change and an undo gives back: {@link #snapshot} plus whatever else the
     * object keeps beside its fields (a product card: its photos, uk/en translations, card status, confidence and
     * journal, the storefront). Taken before and after an application, compared into {@code ai_apply_log.changes};
     * {@link #revertUnchanged} understands every key of it. Not used for «changed while the AI worked» (the job
     * snapshot keeps the plain fields).
     */
    default Map<String, String> applySnapshot(String subjectId) {
        return snapshot(subjectId);
    }

    /**
     * The same, or empty when there is no such object (a deleted one, a malformed id): it throws nothing, so it can be
     * read inside the transaction that creates a job without marking it for rollback.
     */
    Optional<Map<String, String>> find(String subjectId);

    /**
     * Undo: in one transaction, under a lock on the object, puts {@code before} back into every field whose current
     * value still equals {@code after}; a field somebody has changed since is left alone and reported as skipped. Keys
     * are those of {@link #applySnapshot}.
     */
    Reverted revertUnchanged(String subjectId, Map<String, FieldChange> changes);

    record Reverted(List<String> reverted, List<String> skipped) {
    }
}
