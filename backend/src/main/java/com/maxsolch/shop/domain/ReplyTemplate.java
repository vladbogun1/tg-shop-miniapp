package com.maxsolch.shop.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import com.maxsolch.shop.common.UuidUtil;

import java.nio.ByteBuffer;
import java.time.Instant;

/**
 * A canned chat reply the admin inserts with ⚡ in the order chat. The Russian text is the source;
 * the Ukrainian and English ones are content translations (REPLY_TEMPLATE, V50) — the same table and
 * «Переводы» workflow as products. The one matching the customer's language is picked when it is
 * inserted (see ReplyTemplateService).
 *
 * <p>{@code body_uk} / {@code body_en} are no longer read or written; they are left in place so a
 * rollback to a release before V50 still finds the texts it expects.
 */
@Getter
@Setter
@Entity
@Table(name = "reply_templates")
public class ReplyTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "title", nullable = false, length = 128)
    private String title;

    @Column(name = "body_ru", nullable = false, columnDefinition = "TEXT")
    private String bodyRu;

    @Column(name = "body_uk", columnDefinition = "TEXT")
    private String bodyUk;

    @Column(name = "body_en", columnDefinition = "TEXT")
    private String bodyEn;

    @Column(name = "sort", nullable = false)
    private int sort = 0;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;

    /**
     * {@code content_translations.entity_id} of a template: the table's key is 16 bytes (UUIDs for
     * products and tags), a template has a numeric id — it goes into the low 8 bytes,
     * {@code 00000000-0000-0000-0000-00000000000a} for id 10. V50 builds the same value in SQL.
     */
    public static byte[] translationId(long id) {
        return ByteBuffer.allocate(16).putLong(0L).putLong(id).array();
    }

    /** {@link #translationId} as the string the translation API uses. */
    public static String translationKey(long id) {
        return UuidUtil.toString(translationId(id));
    }

    /** The template id inside a translation key, or {@code null} if the key is not one of ours. */
    public static Long idOfTranslationId(byte[] key) {
        if (key == null || key.length != 16) {
            return null;
        }
        ByteBuffer b = ByteBuffer.wrap(key);
        return b.getLong() == 0L ? b.getLong() : null;
    }
}
