package com.maxsolch.shop.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.translation.ContentTranslation;
import com.maxsolch.shop.translation.TranslationEntityType;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.web.ConflictException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

/**
 * Schema import (schema-draft.json format): upsert by slug/key/value, old_tag_slugs take-over,
 * product_moves before parents, name translations, never deletes.
 */
class CatalogSchemaImporterTest {

    InMemoryCatalog db;
    CatalogSchemaImporter importer;
    Category kovriki;
    Category naushniki;
    Product mat;
    Product headset;

    static final String SCHEMA = """
            {"groups":[{"key":"main","label_ru":"Основное","label_uk":"Основне","label_en":"General"},
                       {"key":"dimensions","label_ru":"Размеры"}],
             "global_attributes":[{"key":"color","label_ru":"Цвет","type":"multi","group":"main","filterable":true,
                "options":[{"value":"black","label_ru":"Чёрный","aliases":["черный"]}]}],
             "categories":[
               {"slug":"kovriki","name_ru":"Коврики","name_uk":"Килимки","name_en":"Mouse pads","parent":null,
                "old_tag_slugs":["kovriki"],"sort_order":80,"art_kind":"pad","attributes":[
                  {"key":"size_class","label_ru":"Размер","type":"enum","group":"dimensions",
                   "options":[{"value":"xl","label_ru":"XL"},{"value":"l","label_ru":"L"}]}]},
               {"slug":"kovriki-tkanevye","name_ru":"Тканевые","parent":"kovriki","old_tag_slugs":[],"attributes":[
                  {"key":"thickness_mm","label_ru":"Толщина","type":"number","unit":{"ru":"мм","uk":"мм","en":"mm"},
                   "group":"dimensions","filterable":true,"required_for_ready":true,"highlight":true,
                   "facet":{"style":"buckets","buckets":[{"label_ru":"до 3 мм","min":null,"max":2.9},
                                                         {"label_ru":"3 мм+","min":3,"max":null}]}}]},
               {"slug":"audio","name_ru":"Наушники","parent":null,"old_tag_slugs":["naushniki"],"attributes":[]},
               {"slug":"naushniki-polnorazmernye","name_ru":"Полноразмерные","parent":"audio","attributes":[]}
             ],
             "product_moves":[{"from_category_slug":"kovriki","to_category_slug":"kovriki-tkanevye"},
                              {"from_category_slug":"audio","to_category_slug":"naushniki-polnorazmernye"}],
             "conditions":[]}
            """;

    @BeforeEach
    void setUp() {
        db = new InMemoryCatalog();
        importer = new CatalogSchemaImporter(db.categoryRepository, db.brandRepository, db.groupRepository,
                db.attributeRepository, db.optionRepository, db.productRepository, db.translationRepository,
                mock(TranslationService.class), db.directory);
        kovriki = db.category("kovriki", "Коврики", null);
        naushniki = db.category("naushniki", "Наушники", null);
        mat = db.product("Artisan Zero", kovriki);
        headset = db.product("HyperX Cloud", naushniki);
    }

    private static JsonNode json(String s) throws Exception {
        return new ObjectMapper().readTree(s);
    }

    @Test
    void importBuildsTheTreeMovesProductsAndTranslatesNames() throws Exception {
        CatalogSchemaImporter.Result r = importer.importSchema(json(SCHEMA), 1L);

        assertThat(r.categoriesCreated()).isEqualTo(2);
        assertThat(r.categoriesUpdated()).isEqualTo(2);
        assertThat(r.productsMoved()).isEqualTo(2);
        assertThat(r.attributesCreated()).isEqualTo(3);
        assertThat(r.optionsCreated()).isEqualTo(3);

        Category tkan = db.bySlug("kovriki-tkanevye").orElseThrow();
        assertThat(tkan.getParentId()).isEqualTo(kovriki.getId());
        assertThat(mat.getCategoryId()).isEqualTo(tkan.getId());
        assertThat(kovriki.getSortOrder()).isEqualTo(80);
        assertThat(kovriki.getArtKind()).isEqualTo("pad");
        // old_tag_slugs: «naushniki» was taken over by the new «audio» (same id, its products moved on)
        assertThat(naushniki.getSlug()).isEqualTo("audio");
        assertThat(headset.getCategoryId()).isEqualTo(db.bySlug("naushniki-polnorazmernye").orElseThrow().getId());

        ContentTranslation uk = db.translations.stream()
                .filter(t -> t.getId().getEntityType() == TranslationEntityType.CATEGORY
                        && Arrays.equals(t.getId().getEntityId(), kovriki.getId()) && "uk".equals(t.getId().getLocale()))
                .findFirst().orElseThrow();
        assertThat(uk.getText()).isEqualTo("Килимки");
        assertThat(uk.getSourceHash()).isEqualTo(TranslationService.sha256Hex("Коврики"));

        CatalogSnapshot s = db.directory.load();
        CatalogSnapshot.Attr thickness = s.attributesFor(UuidUtilHelper.id(tkan)).stream()
                .filter(a -> a.key().equals("thickness_mm")).findFirst().orElseThrow();
        assertThat(thickness.required()).isTrue();
        assertThat(thickness.highlight()).isTrue();
        assertThat(thickness.unit("en")).isEqualTo("mm");
        assertThat(thickness.buckets()).extracting(CatalogSnapshot.Bucket::id).containsExactly("lt3", "gte3");
        assertThat(s.attributesFor(UuidUtilHelper.id(tkan))).extracting(CatalogSnapshot.Attr::key)
                .containsExactly("color", "size_class", "thickness_mm");
    }

    @Test
    void reImportUpsertsAndNeverDeletes() throws Exception {
        importer.importSchema(json(SCHEMA), 1L);
        int cats = db.categories.size();
        int attrs = db.attributes.size();
        int opts = db.options.size();

        CatalogSchemaImporter.Result r = importer.importSchema(json("""
                {"groups":[],"global_attributes":[{"key":"color","label_ru":"Цвет корпуса","type":"multi","group":"main",
                   "options":[{"value":"white","label_ru":"Белый"}]}],
                 "categories":[{"slug":"kovriki","name_ru":"Коврики для мыши","parent":null,"attributes":[]}]}"""), 1L);

        assertThat(r.categoriesUpdated()).isEqualTo(1);
        assertThat(db.categories).hasSize(cats);
        assertThat(db.attributes).hasSize(attrs);
        assertThat(db.options).hasSize(opts + 1);                     // black kept, white added
        assertThat(kovriki.getName()).isEqualTo("Коврики для мыши");
        assertThat(db.bySlug("kovriki-tkanevye").orElseThrow().getParentId()).isEqualTo(kovriki.getId());
    }

    @Test
    void aParentWithProductsWithoutAMoveRollsBack() throws Exception {
        String noMoves = SCHEMA.replace("\"product_moves\"", "\"ignored\"");
        assertThatThrownBy(() -> importer.importSchema(json(noMoves), 1L))
                .isInstanceOf(ConflictException.class)
                .satisfies(e -> assertThat(((ConflictException) e).getCode()).isEqualTo(CategoryRules.HAS_PRODUCTS));
    }

    @Test
    void duplicateKeysAlongAPathAreRefused() throws Exception {
        assertThatThrownBy(() -> importer.importSchema(json("""
                {"global_attributes":[{"key":"color","label_ru":"Цвет","type":"multi","group":"main","options":[]}],
                 "categories":[{"slug":"kovriki","name_ru":"Коврики","attributes":[
                   {"key":"color","label_ru":"Цвет","type":"enum","group":"main","options":[]}]}]}"""), 1L))
                .isInstanceOf(ConflictException.class);
    }

    /** Small helper so the test reads naturally. */
    static final class UuidUtilHelper {
        static String id(Category c) {
            return com.maxsolch.shop.common.UuidUtil.toString(c.getId());
        }
    }
}
