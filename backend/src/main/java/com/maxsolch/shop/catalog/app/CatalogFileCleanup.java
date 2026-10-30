package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.CatalogFilesDropped;
import com.maxsolch.shop.media.app.ImageStorageService;
import com.maxsolch.shop.platform.tx.OnCommitted;
import org.springframework.stereotype.Component;

/** Deletes stored files a committed catalog change no longer refers to (a rollback must not lose them). */
@Component
class CatalogFileCleanup {

    private final ImageStorageService storage;

    CatalogFileCleanup(ImageStorageService storage) {
        this.storage = storage;
    }

    @OnCommitted
    void onFilesDropped(CatalogFilesDropped event) {
        event.keys().forEach(storage::deleteQuietly);
    }
}
