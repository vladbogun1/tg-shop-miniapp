package com.maxsolch.shop.returns.domain;

/** What happens to the returned units of one order line. */
public enum LineOutcome {
    /** Came back sellable: back on the shelf. */
    RESTOCK,
    /** Came back broken: written off (report «Списания»). */
    DEFECT,
    /** The customer keeps the goods (compensation only): the units stay sold. */
    KEPT,
    /**
     * Sent back by post, not here yet: the units count as returned (no longer sold), the order
     * shows in «Едет назад» and «Посылка вернулась» decides shelf or write-off.
     */
    IN_TRANSIT
}
