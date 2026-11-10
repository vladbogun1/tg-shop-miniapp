package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.translation.app.TranslatableSource.Field;
import com.maxsolch.shop.translation.app.TranslationService.Key;
import com.maxsolch.shop.translation.domain.ContentTranslation;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/** The reads of an auto-translation run, each in its own read-only transaction (the sources touch JPA entities). */
@Component
class AutoTranslationReads {

    private final TranslationRows store;

    AutoTranslationReads(TranslationRows store) {
        this.store = store;
    }

    @Transactional(readOnly = true)
    public Map<Key, Field> sources() {
        return store.sources();
    }

    @Transactional(readOnly = true)
    public Map<Key, ContentTranslation> rows(String locale) {
        return store.existing(locale);
    }
}
