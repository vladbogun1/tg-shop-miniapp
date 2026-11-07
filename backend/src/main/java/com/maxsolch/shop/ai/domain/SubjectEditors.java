package com.maxsolch.shop.ai.domain;

import java.time.Instant;
import java.util.List;

/**
 * Who changed an object of AI tasks and when — for «Иван изменил «Вес» в 14:20» in the review. The module that owns
 * the objects implements it from its own journal (the catalog — from the admin audit of the product); {@code ai}
 * knows neither. The journal tells who touched the card, not which field: the review names the people who edited the
 * card after the start next to each field that differs from the snapshot.
 */
public interface SubjectEditors {

    /** The {@code subject_type} this implementation serves. */
    String subjectType();

    /** People who changed the object at or after {@code since}: one line per person with their last change, newest first. */
    List<Edit> since(String subjectId, Instant since);

    record Edit(String who, Instant at) {
    }
}
