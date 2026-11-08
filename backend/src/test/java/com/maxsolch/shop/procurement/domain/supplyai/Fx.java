package com.maxsolch.shop.procurement.domain.supplyai;

import java.util.List;

/** Shared fixtures, ported from ai.test.ts of the admin frontend. */
final class Fx {

    static final CatalogItem ZP1_BLACK = new CatalogItem("11111111-aaaa-4000-8000-000000000001",
            "Коврик Zpmax ZP1 Advanced 490×420 чёрный", "Zpmax", "c-mats", List.of(), null);
    static final CatalogItem ZP1_RED = new CatalogItem("11111111-aaaa-4000-8000-000000000002",
            "Коврик Zpmax ZP1 Advanced 490×420 красный", "Zpmax", "c-mats", List.of(), null);
    static final CatalogItem ZP2 = new CatalogItem("11111111-aaaa-4000-8000-000000000003",
            "Коврик Zpmax ZP2 490×420 синий", "Zpmax", "c-mats", List.of(), null);
    static final CatalogItem SLEEVE = new CatalogItem("22222222-bbbb-4000-8000-000000000001",
            "Рукав Zpmax 4.0 Ice с петлёй под палец (правая рука)", "Zpmax", "c-acc",
            List.of(new CatalogItem.Variant("v-m", "M"), new CatalogItem.Variant("v-xl", "XL")), null);
    static final List<CatalogItem> CATALOG = List.of(ZP1_BLACK, ZP1_RED, ZP2, SLEEVE);
    static final List<LeafCategory> CATS = List.of(new LeafCategory("c-mats", "kovriki", "Коврики"));

    static final String TAOBAO = "Вот:\n```json\n" + """
            {"supplier":"Zpmax准枪电竞外设企业店","currency":"¥","total":943.48,"lines":[
              {"text":"Zpmax准枪ZP1控制鼠标垫FPS","variant":"ZP1 进阶版 黑色 尺寸490*420*4...","brand":"Zpmax","model":"ZP1 Advanced","color":"black","qty":4,"unitPrice":"¥134.67"},
              {"text":"Zpmax准枪4.0 FPS游戏电竞冰","variant":"XL码 拇指开口款 单只","en":"4.0 ice sleeve, thumb hole, XL","brand":"Zpmax","model":"4.0 Ice","qty":3,"unitPrice":43.9},
              {"text":"Zpmax准枪4.0 FPS游戏电竞冰","variant":"XL码 拇指开口款 单只","brand":"Zpmax","model":"4.0 Ice","qty":3,"unitPrice":43.9},
              {"text":"Zpmax准枪ZP3速度电竞FPS","variant":"ZP3 山青色 490*420*4MM","brand":"Zpmax","model":"ZP3","color":"teal","qty":4,"unitPrice":134.67,"lineTotal":538.68},
              {"text":"","qty":2}]}
            """ + "\n```";

    static SourceLine line(String id) {
        return new SourceLine(id, id, null, null, null, null, null, 1, null, null, null);
    }

    static SourceLine line(String id, int qty, Double unitPrice) {
        return new SourceLine(id, id, null, null, null, null, null, qty, unitPrice, null, null);
    }

    static ReviewRow row(SourceLine l, LineDecision d) {
        return new ReviewRow(l, d, List.of());
    }

    private Fx() {
    }
}
