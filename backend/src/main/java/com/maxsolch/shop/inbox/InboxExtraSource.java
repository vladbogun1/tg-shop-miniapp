package com.maxsolch.shop.inbox;

import com.maxsolch.shop.inbox.InboxDtos.Item;

import java.time.Instant;
import java.util.List;

/**
 * A module that contributes ready-made «Внимание» rows of its own kind (e.g. support threads)
 * without the inbox having to know its tables. Rows obey the usual marks, sorting and counting.
 */
public interface InboxExtraSource {

    /** Current rows; must not throw for a transient failure — return an empty list instead. */
    List<Item> items(Instant now);
}
