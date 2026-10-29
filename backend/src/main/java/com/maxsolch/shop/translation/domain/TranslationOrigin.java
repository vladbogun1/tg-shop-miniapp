package com.maxsolch.shop.translation.domain;

/** Who wrote a translation. MANUAL rows are never overwritten by an import unless it is forced. */
public enum TranslationOrigin {
    AI,
    MANUAL
}
