package com.maxsolch.shop.catalog.app;

import java.util.List;
import java.util.Map;

/**
 * Карточка нового товара из ответа ИИ, уже разобранная и очищенная от мусора (см. {@link CardAnswerParser}).
 * Хранится как есть до подтверждения поставки; применяется через {@link NewProductCards#toImportItem}.
 *
 * @param categorySlug  slug из ответа (как написал ИИ) или null
 * @param categoryId    id категории-листа по slug; null, если такой категории нет или она не лист
 * @param specs         значения как в ответе (проверяет импорт карточек по схеме)
 * @param confidence    уверенность 0..100 по ключам характеристик
 * @param overall       общая уверенность 0..100 или null
 * @param title         название ru/uk/en (только непустые языки)
 * @param description   описание ru/uk/en (только непустые языки)
 * @param conditionNote причина уценки ru/uk/en или null
 * @param sources       ссылки-источники (http/https)
 * @param photos        ссылки на фото (http/https, до 8)
 * @param fieldSources  ключ характеристики → ссылка, откуда значение
 * @param notes         заметки ИИ для админа или null
 */
public record CardDraft(String categorySlug, String categoryId, String brand, Map<String, Object> specs,
                        Map<String, Integer> confidence, Integer overall, Map<String, String> title,
                        Map<String, String> description, Map<String, String> conditionNote, List<String> sources,
                        List<String> photos, Map<String, String> fieldSources, String notes) {
}
