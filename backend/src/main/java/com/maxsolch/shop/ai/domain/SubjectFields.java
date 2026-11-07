package com.maxsolch.shop.ai.domain;

import java.util.List;
import java.util.Map;

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
     * Undo: in one transaction, under a lock on the object, puts {@code before} back into every field whose current
     * value still equals {@code after}; a field somebody has changed since is left alone and reported as skipped.
     */
    Reverted revertUnchanged(String subjectId, Map<String, FieldChange> changes);

    record Reverted(List<String> reverted, List<String> skipped) {
    }
}
