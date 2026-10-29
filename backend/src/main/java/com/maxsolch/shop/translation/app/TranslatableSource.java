package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.translation.app.TranslationService.Key;
import com.maxsolch.shop.translation.domain.SourceHash;
import com.maxsolch.shop.translation.domain.TranslationEntityType;

import java.util.Map;
import java.util.Set;

/**
 * Translation SPI: a module that owns texts which can be translated (catalog: products, variants, categories;
 * payment: payment methods; support: chat templates; translation itself: bot phrases) implements this and
 * registers itself simply by being a Spring bean. The translation module knows no product, payment method or
 * template — it asks every source for its fields and hands a proofread Russian text back to the owner.
 */
public interface TranslatableSource {

    /** The types of {@code content_translations} this source owns. */
    Set<TranslationEntityType> types();

    /** Every translatable field of every existing entity of {@link #types()} with its current Russian source. */
    Map<Key, Field> fields();

    /**
     * Replaces the Russian source of one field, optimistically: only when the current text still hashes to what the
     * admin saw (see {@link SourceChange#holds}).
     *
     * @return OK | STALE | NOT_FOUND | INVALID_*
     */
    String applySource(SourceChange change);

    /** Column limit of the Russian source of a field, or {@code null} when there is none to check. */
    Integer maxSourceChars(TranslationEntityType type, String field);

    /**
     * The Russian source of one field; {@code inScope} = part of the export (a live entity);
     * {@code ownerId}/{@code ownerTitle} = the owning product of PRODUCT/VARIANT fields (or the name of whatever
     * the text belongs to, shown next to it in the screen and in the AI prompt), else null.
     */
    record Field(String text, boolean inScope, String ownerId, String ownerTitle) {
        public Field(String text, boolean inScope) {
            this(text, inScope, null, null);
        }
    }

    /** A request to set a new Russian source of a field. */
    record SourceChange(TranslationEntityType type, byte[] entityId, String field, String wantedHash,
                        String newSource, String newHash) {

        /** The field still holds what the admin saw — or already holds the fix (a repeated click). */
        public boolean holds(String current) {
            if (current == null) {
                return false;
            }
            String h = SourceHash.sha256Hex(current);
            return h.equals(wantedHash) || h.equals(newHash);
        }
    }
}
