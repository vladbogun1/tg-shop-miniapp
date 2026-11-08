package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.app.CatalogDtos.CardImportItem;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardTranslation;
import com.maxsolch.shop.catalog.domain.CardPromptText;
import com.maxsolch.shop.catalog.domain.CardSchemaSection;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot.Cat;
import com.maxsolch.shop.catalog.domain.JsLikeJson;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * ИИ-карточка для НОВОГО товара (его ещё нет в базе): промпт и разбор ответа на сервере. Промпт — тот же текст, что
 * {@code buildCardPrompt} в frontend-admin/features/cards/model/prompt.ts для товара «Новый» без описания, характеристик
 * и фото (см. {@code CardPromptInSyncTest}). Публичный API каталога для модуля procurement: он ставит задачу CARD,
 * хранит ответ, а при подтверждении поставки создаёт товар и применяет карточку через {@code CardsImporter.importCards}.
 */
@Service
public class NewProductCards {

    /** Как в prompt.ts: у товара нет фото. */
    static final String NO_PHOTOS_HINT = "у товара нет ни одного фото — найди обязательно";

    private final CatalogDirectory directory;

    public NewProductCards(CatalogDirectory directory) {
        this.directory = directory;
    }

    /**
     * Один товар запроса.
     *
     * @param key        ключ товара в промпте и в ответе ИИ («p» + 8 hex); уникален в пакете
     * @param categoryId категория товара, если известна (null — ИИ выберет сам)
     * @param variants   названия вариантов (цвет, размер)
     * @param priceUah   цена в гривнах или null
     * @param note       строка накладной как есть (необязательно) — подсказка для ИИ
     */
    public record Input(String key, String title, String brand, String categoryId, List<String> variants, Long priceUah,
                        String note) {
    }

    /** Промпт на пакет новых товаров (один пакет «1 из 1»). */
    public String prompt(List<Input> items) {
        CatalogSnapshot snap = directory.snapshot();
        List<String> categories = new ArrayList<>();
        Map<String, Object> products = new LinkedHashMap<>();
        for (Input it : items) {
            categories.add(it.categoryId());
            products.put(it.key(), productInput(it, snap));
        }
        return CardPromptText.header(items.size())
                + "\n"
                + CardSchemaSection.render(snap, categories)
                + "\n\n## Товары (JSON: id → текущие данные; category — slug, specs — текущие значения по схеме)\n"
                + "```json\n"
                + JsLikeJson.stringify(products)
                + "\n```\n";
    }

    /** Карточка товара {@code key} из ответа ИИ; пусто, если ответа по этому ключу нет или он не читается. */
    public Optional<CardDraft> parse(String answer, String key) {
        CatalogSnapshot snap = directory.snapshot();
        return CardAnswerParser.parse(answer, key, slug -> {
            Cat c = snap.categoryBySlug(slug);
            return c != null && snap.isLeaf(c.id()) ? c.id() : null;
        });
    }

    /**
     * Запись для {@code CardsImporter.importCards}: характеристики с уверенностью и источниками, описание ru и переводы
     * uk/en (название uk/en — только при {@code keepAiTitle}, т. е. когда название товара оставлено от ИИ). Категорию,
     * название, публикацию и «Готово» решает вызывающий: {@code categorySlug}, {@code title} = null, флаги false.
     */
    public CardImportItem toImportItem(String productId, CardDraft card, boolean keepAiTitle) {
        Map<String, Object> confidence = new LinkedHashMap<>();
        card.confidence().forEach((k, v) -> {
            if (card.specs().containsKey(k)) {
                confidence.put(k, v);
            }
        });
        Map<String, CardTranslation> translations = new LinkedHashMap<>();
        for (String lang : List.of("uk", "en")) {
            String title = keepAiTitle ? card.title().get(lang) : null;
            String description = card.description().get(lang);
            if (title != null || description != null) {
                translations.put(lang, new CardTranslation(title, description, null));
            }
        }
        return new CardImportItem(productId, null, null, new LinkedHashMap<>(card.specs()), confidence, card.overall(),
                card.description().get("ru"), emptyToNull(card.sources()), card.notes(), null, false, null, null, null,
                translations.isEmpty() ? null : translations, false, emptyToNull(card.fieldSources()));
    }

    // ---------------------------------------------------------------- product input

    /** Порядок и состав ключей — как {@code productInput} в prompt.ts для нового товара без описания/specs/фото. */
    private static Map<String, Object> productInput(Input it, CatalogSnapshot snap) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("title", it.title());
        o.put("brand", blankToNull(it.brand()));
        Cat cat = snap.category(it.categoryId());
        o.put("category", cat == null ? null : cat.slug());
        if (cat != null) {
            o.put("categoryPath", CardSchemaSection.pathName(snap, cat.id()));
            if (!snap.isLeaf(cat.id())) {
                o.put("categoryNote", "это не лист — выбери подкатегорию");
            }
        }
        List<String> variants = it.variants() == null ? List.of()
                : it.variants().stream().map(v -> v == null ? "" : v.strip()).filter(v -> !v.isEmpty()).toList();
        if (!variants.isEmpty()) {
            o.put("variants", variants);
        }
        if (it.priceUah() != null) {
            o.put("priceUah", it.priceUah());
        }
        if (blankToNull(it.note()) != null) {
            o.put("invoiceLine", it.note().strip());
        }
        o.put("description", "");
        o.put("specs", Map.of());
        o.put("photos", NO_PHOTOS_HINT);
        return o;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    private static <T extends java.util.Collection<?>> T emptyToNull(T c) {
        return c == null || c.isEmpty() ? null : c;
    }

    private static <K, V> Map<K, V> emptyToNull(Map<K, V> m) {
        return m == null || m.isEmpty() ? null : m;
    }
}
