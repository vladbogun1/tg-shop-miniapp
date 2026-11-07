package com.maxsolch.shop.ai.domain;

/**
 * The port through which a module that owns the objects of a feature writes the result of a task itself, on the server,
 * without a screen being open (translations: the answer becomes draft rows of the translation module). The {@code ai}
 * module knows no such module; it asks the writer of the task's feature, if there is one, right after the answer has
 * passed the structural check and before the task is marked done. A feature without a writer is applied by the screen
 * (cards), which reports the outcome itself.
 */
public interface ResultWriter {

    /** The feature whose answers this writer writes. */
    AiFeature feature();

    /**
     * Writes the answer of {@code job}; {@code prompt} is what was asked. A thrown exception ends the task as failed
     * (nothing is half-applied: the writer's own transaction rolls back), so «Повторить неудачные» can ask again.
     */
    Written write(AiJob job, String prompt, String answer);

    /**
     * What was done, in the units of the feature (translations: places x languages).
     *
     * @param applied       written
     * @param rejected      not written: failed the checks, missing from the answer, changed meanwhile
     * @param ignoredLocked left as it was because a person wrote it
     */
    record Written(int applied, int rejected, int ignoredLocked) {
    }
}
