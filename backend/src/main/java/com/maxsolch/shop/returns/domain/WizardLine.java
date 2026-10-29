package com.maxsolch.shop.returns.domain;

/** One line of the return wizard: units of this order item and what state they are in. */
public record WizardLine(long itemId, int quantity, LineOutcome outcome) {
}
