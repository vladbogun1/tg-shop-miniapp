package com.maxsolch.shop.translation;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.Arrays;
import java.util.Objects;

/** {@code PRIMARY KEY (entity_type, entity_id, field, locale)}. byte[] needs hand-written equality. */
@Getter
@NoArgsConstructor
@Embeddable
public class ContentTranslationId implements Serializable {

    @Enumerated(EnumType.STRING)
    @Column(name = "entity_type", nullable = false)
    private TranslationEntityType entityType;

    @Column(name = "entity_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] entityId;

    @Column(name = "field", nullable = false, length = 32)
    private String field;

    @Column(name = "locale", nullable = false, length = 8)
    private String locale;

    public ContentTranslationId(TranslationEntityType entityType, byte[] entityId, String field, String locale) {
        this.entityType = entityType;
        this.entityId = entityId;
        this.field = field;
        this.locale = locale;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof ContentTranslationId other)) {
            return false;
        }
        return entityType == other.entityType
                && Arrays.equals(entityId, other.entityId)
                && Objects.equals(field, other.field)
                && Objects.equals(locale, other.locale);
    }

    @Override
    public int hashCode() {
        return Objects.hash(entityType, Arrays.hashCode(entityId), field, locale);
    }
}
