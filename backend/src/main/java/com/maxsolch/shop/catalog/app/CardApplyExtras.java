package com.maxsolch.shop.catalog.app;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.maxsolch.shop.catalog.domain.CardStatus;
import com.maxsolch.shop.catalog.domain.CatalogFilesDropped;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductImage;
import com.maxsolch.shop.catalog.domain.SpecsJson;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.translation.app.StoredTranslations;
import com.maxsolch.shop.translation.domain.ContentLocale;
import com.maxsolch.shop.translation.domain.ContentTranslation;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.translation.domain.TranslationOrigin;
import com.maxsolch.shop.translation.domain.TranslationsChanged;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * What an application of an AI answer writes into a product card beside its fields, for the journal of applications
 * ({@link ProductCardFields#applySnapshot}) and its undo: the photos ({@code photo:<stored key>}), the uk/en translations
 * ({@code tr:<locale>:<field>}, the whole row as JSON, so the undo puts back the same text, origin, check mark and
 * source), the card status, its confidence and journal ({@code status}, {@code confidence}, {@code meta}), the
 * storefront ({@code active}) and the «never published» mark ({@code unfinished}). An empty value is absent, as with
 * the fields. A photo is removed the way the admin form removes one: the row goes, the file is deleted after the commit.
 */
@Component
class CardApplyExtras {

    static final String META = "meta";
    private static final String PHOTO = "photo:";
    private static final String TR = "tr:";
    private static final ObjectMapper SORTED = SpecsJson.MAPPER.copy()
            .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {
    };

    private final StoredTranslations translations;
    private final DomainEvents events;

    CardApplyExtras(StoredTranslations translations, DomainEvents events) {
        this.translations = translations;
        this.events = events;
    }

    /** What one undo collected: files to delete after the commit, whether translations changed. */
    static final class Undo {
        private final List<String> droppedFiles = new ArrayList<>();
        private boolean translationsChanged;
    }

    static boolean handles(String key) {
        return key.startsWith(PHOTO) || key.startsWith(TR) || key.equals("status") || key.equals("confidence")
                || key.equals("active") || key.equals("unfinished");
    }

    /** Adds the extras of the card to {@code out}. */
    void read(Product p, Map<String, String> out) {
        put(out, "status", p.getCardStatus() == null ? null : p.getCardStatus().name());
        put(out, "confidence", p.getCardConfidence() == null ? null : String.valueOf(p.getCardConfidence()));
        put(out, META, canonical(p.getCardMetaJson()));
        put(out, "active", p.isActive() ? "true" : null);
        put(out, "unfinished", p.isUnfinished() ? "true" : null);
        p.getImages().forEach(img -> put(out, PHOTO + img.getUrl(), img.getUrl()));
        for (ContentTranslation row : translations.findForEntity(TranslationEntityType.PRODUCT, p.getId())) {
            if (ContentLocale.isTranslated(row.getId().getLocale())) {
                put(out, TR + row.getId().getLocale() + ":" + row.getId().getField(), rowJson(row));
            }
        }
    }

    /** Puts back one key ({@link #handles}); false when it cannot be given back (a removed photo: its file is gone). */
    boolean putBack(Product p, String key, String before, Undo undo) {
        if (key.startsWith(PHOTO)) {
            return before == null && dropPhoto(p, key.substring(PHOTO.length()), undo);
        }
        if (key.startsWith(TR)) {
            putBackTranslation(p, key.substring(TR.length()), before);
            undo.translationsChanged = true;
            return true;
        }
        switch (key) {
            case "status" -> p.changeCardStatus(before == null ? CardStatus.DRAFT : CardStatus.parse(before));
            case "confidence" -> p.recordCardConfidence(before == null ? null : Integer.valueOf(before));
            case "active" -> p.showInShop(before != null);
            case "unfinished" -> p.markUnfinished(before != null);
            default -> {
                return false;
            }
        }
        return true;
    }

    /** After the product is saved: the files of removed photos (after the commit) and the translation caches. */
    void finish(Undo undo) {
        if (!undo.droppedFiles.isEmpty()) {
            events.publish(new CatalogFilesDropped(List.copyOf(undo.droppedFiles)));
        }
        if (undo.translationsChanged) {
            events.publish(new TranslationsChanged());
        }
    }

    /** The journal of the card in one spelling (keys sorted), so a value read twice compares equal. */
    static String canonical(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return SORTED.writeValueAsString(SORTED.readValue(json, Object.class));
        } catch (JsonProcessingException e) {
            return json;
        }
    }

    private static boolean dropPhoto(Product p, String key, Undo undo) {
        boolean removed = p.getImages().removeIf(img -> key.equals(img.getUrl()));
        if (removed) {
            undo.droppedFiles.add(key);
            renumber(p);
        }
        return removed;
    }

    private static void renumber(Product p) {
        List<ProductImage> left = new ArrayList<>(p.getImages());
        left.sort(java.util.Comparator.comparingInt(ProductImage::getSortOrder));
        for (int i = 0; i < left.size(); i++) {
            left.get(i).setSortOrder(i);
        }
    }

    private void putBackTranslation(Product p, String localeField, String before) {
        int cut = localeField.indexOf(':');
        String locale = localeField.substring(0, cut);
        String field = localeField.substring(cut + 1);
        Optional<ContentTranslation> row = find(p, locale, field);
        if (before == null) {
            row.ifPresent(translations::delete);
            return;
        }
        Map<String, Object> v = read(before);
        String text = (String) v.get("text");
        String source = (String) v.get("sourceText");
        if (row.isEmpty()) {
            translations.write(TranslationEntityType.PRODUCT, p.getId(), field, locale, text, source == null ? "" : source,
                    TranslationOrigin.AI, null);
        }
        ContentTranslation r = find(p, locale, field).orElseThrow();
        r.setText(text);
        r.setSourceText(source);
        r.setSourceHash((String) v.get("sourceHash"));
        r.setOrigin(TranslationOrigin.valueOf((String) v.get("origin")));
        r.setReviewedAt(v.get("reviewedAt") == null ? null : Instant.parse((String) v.get("reviewedAt")));
        r.setUpdatedBy(v.get("updatedBy") == null ? null : ((Number) v.get("updatedBy")).longValue());
        translations.save(r);
    }

    private Optional<ContentTranslation> find(Product p, String locale, String field) {
        return translations.findForEntity(TranslationEntityType.PRODUCT, p.getId()).stream()
                .filter(r -> locale.equals(r.getId().getLocale()) && field.equals(r.getId().getField()))
                .findFirst();
    }

    private static String rowJson(ContentTranslation row) {
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("text", row.getText());
        v.put("origin", row.getOrigin() == null ? null : row.getOrigin().name());
        v.put("reviewedAt", row.getReviewedAt() == null ? null : row.getReviewedAt().toString());
        v.put("sourceHash", row.getSourceHash());
        v.put("sourceText", row.getSourceText());
        v.put("updatedBy", row.getUpdatedBy());
        try {
            return SORTED.writeValueAsString(v);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static Map<String, Object> read(String json) {
        try {
            return SORTED.readValue(json, MAP);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("ai_apply_log: a translation is not readable", e);
        }
    }

    private static void put(Map<String, String> out, String key, String value) {
        if (value != null && !value.isBlank()) {
            out.put(key, value);
        }
    }
}
