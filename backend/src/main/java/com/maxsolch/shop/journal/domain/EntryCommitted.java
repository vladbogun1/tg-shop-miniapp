package com.maxsolch.shop.journal.domain;

/** A journal row waiting for its transaction to commit. */
public record EntryCommitted(ActivityRow row) {
}
