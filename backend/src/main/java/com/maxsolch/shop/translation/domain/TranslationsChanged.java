package com.maxsolch.shop.translation.domain;

/**
 * The stored content translations changed (import, accept, source fix, delete, orphan sweep, schema import).
 * Published inside the writing transaction; whoever keeps translated text in memory drops it after the commit:
 * the translation snapshots, the bot phrases and the catalog caches.
 */
public record TranslationsChanged() {
}
