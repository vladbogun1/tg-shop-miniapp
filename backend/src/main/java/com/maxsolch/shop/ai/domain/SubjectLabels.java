package com.maxsolch.shop.ai.domain;

import java.util.Collection;
import java.util.Map;

/**
 * A readable name for the objects of AI tasks of one type («Кружка Lamzu» for a product). The module that owns the
 * objects implements it (the catalog for {@code PRODUCT}); {@code ai} must not depend on it, so the task list asks
 * through this port and shows the id where nobody knows the name.
 */
public interface SubjectLabels {

    /** The {@code subject_type} this implementation names. */
    String subjectType();

    /** Names by subject id; an id with no name (deleted object) is absent. */
    Map<String, String> labels(Collection<String> subjectIds);
}
