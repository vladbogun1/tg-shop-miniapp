package com.maxsolch.shop.ai.domain;

/**
 * What an AI call served — the column {@code ai_usage.feature} and every per-feature setting and metric. An enum, not
 * free text: a typo would silently start a new line in the metrics, and the column is only 32 characters.
 */
public enum AiFeature {
    /** Characteristics of one or several products (the cards wizard). */
    CARD,
    /** «Fill in the card» of one product (create product, products list, supply line). */
    COMPLETION,
    /** Content translations uk/en. */
    TRANSLATION,
    /** Reading a supplier invoice (screenshots, PDF). */
    SUPPLY_EXTRACT,
    /** Matching invoice lines with the catalog. */
    SUPPLY_MATCH,
    /** «Check search» on the AI settings screen. */
    SEARCH_TEST;

    /** Prices and quantities of a supplier invoice: the texts go to the admin who started the job and to finance admins. */
    public boolean purchaseData() {
        return this == SUPPLY_EXTRACT || this == SUPPLY_MATCH;
    }
}
