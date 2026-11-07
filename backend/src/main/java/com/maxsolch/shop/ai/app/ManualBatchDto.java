package com.maxsolch.shop.ai.app;

import java.util.List;

/**
 * A manual batch as its screen gets it: the batch with its jobs (one per object the admin pasted an answer for), the
 * objects in the order of the parts with the version of each at the start, the size of a part, and the screen's draft.
 *
 * @param draft JSON the screen saved (the current part, the pasted answers); null until it saves one
 */
public record ManualBatchDto(AiBatchDto batch, int partSize, List<Item> items, String draft) {

    /** An object of the batch: its id and the version of it the prompts were built from. */
    public record Item(String subjectId, String subjectVersion) {
    }
}
