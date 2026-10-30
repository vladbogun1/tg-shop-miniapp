package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.translation.domain.ContentTranslation;
import com.maxsolch.shop.translation.domain.ContentTranslationId;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.translation.domain.TranslationOrigin;
import com.maxsolch.shop.translation.infra.ContentTranslationRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Optional;

/**
 * Reading and writing single stored translations for other modules (the catalog's AI card import and schema
 * import). The caller publishes {@code TranslationsChanged} once its transaction is done.
 */
@Service
public class StoredTranslations {

    private final ContentTranslationRepository repository;

    public StoredTranslations(ContentTranslationRepository repository) {
        this.repository = repository;
    }

    /** What is stored for one field of one entity in one language. */
    public record Stored(String text, TranslationOrigin origin, String sourceHash) {
    }

    public Optional<Stored> find(TranslationEntityType type, byte[] entityId, String field, String locale) {
        return repository.findById(new ContentTranslationId(type, entityId, field, locale))
                .map(row -> new Stored(row.getText(), row.getOrigin(), row.getSourceHash()));
    }

    /** Creates or updates the translation; {@code updatedBy} is left alone. */
    public void write(TranslationEntityType type, byte[] entityId, String field, String locale, String text,
                      String source, TranslationOrigin origin, Instant reviewedAt) {
        ContentTranslation row = row(type, entityId, field, locale);
        fill(row, text, source, origin, reviewedAt);
        repository.save(row);
    }

    /** Same, and records who did it. */
    public void write(TranslationEntityType type, byte[] entityId, String field, String locale, String text,
                      String source, TranslationOrigin origin, Instant reviewedAt, Long updatedBy) {
        ContentTranslation row = row(type, entityId, field, locale);
        fill(row, text, source, origin, reviewedAt);
        row.setUpdatedBy(updatedBy);
        repository.save(row);
    }

    private ContentTranslation row(TranslationEntityType type, byte[] entityId, String field, String locale) {
        ContentTranslationId id = new ContentTranslationId(type, entityId, field, locale);
        return repository.findById(id).orElseGet(() -> new ContentTranslation(id));
    }

    private static void fill(ContentTranslation row, String text, String source, TranslationOrigin origin,
                             Instant reviewedAt) {
        row.setText(text);
        row.setSource(source);
        row.setOrigin(origin);
        row.setReviewedAt(reviewedAt);
    }
}
