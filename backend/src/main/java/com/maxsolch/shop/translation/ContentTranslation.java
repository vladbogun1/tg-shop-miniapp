package com.maxsolch.shop.translation;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import lombok.Getter;
import lombok.Setter;
import org.springframework.data.domain.Persistable;

import java.time.Instant;

/**
 * One translated field of one entity in one language (V21, docs/CONTENT-I18N.md).
 *
 * <p>{@link Persistable} so that saving a brand-new row is a plain INSERT: with an assigned
 * composite id Spring Data would otherwise {@code merge()} — one extra SELECT per row of an import.
 */
@Getter
@Setter
@Entity
@Table(name = "content_translations")
public class ContentTranslation implements Persistable<ContentTranslationId> {

    @EmbeddedId
    private ContentTranslationId id;

    @Column(name = "text", columnDefinition = "TEXT", nullable = false)
    private String text;

    /** SHA-256 (hex, lower case) of the Russian source the text was translated from. */
    @Column(name = "source_hash", columnDefinition = "CHAR(64)", nullable = false)
    private String sourceHash;

    /**
     * The Russian source itself (V56) — lets the screen show what changed in it once the translation
     * goes stale. Null for rows written before V56 that were already stale then.
     */
    @Column(name = "source_text", columnDefinition = "TEXT")
    private String sourceText;

    @Enumerated(EnumType.STRING)
    @Column(name = "origin", nullable = false)
    private TranslationOrigin origin = TranslationOrigin.AI;

    /** A person looked at it and accepted it (V56); null = AI output nobody has checked yet. */
    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    /** Telegram id of the admin who imported / edited it. */
    @Column(name = "updated_by")
    private Long updatedBy;

    @Transient
    private boolean fresh = true;

    public ContentTranslation() {
    }

    public ContentTranslation(ContentTranslationId id) {
        this.id = id;
    }

    /** Binds the text to the Russian {@code source} it was made from (hash + snapshot). */
    public void setSource(String source) {
        this.sourceHash = TranslationService.sha256Hex(source);
        this.sourceText = source;
    }

    @Override
    public boolean isNew() {
        return fresh;
    }

    @PostLoad
    @PostPersist
    void markNotNew() {
        fresh = false;
    }
}
