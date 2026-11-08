package com.maxsolch.shop.procurement.domain.supplyai;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Step 1 of "Supply with AI": the "read the document" prompt and the parser of the answer (JSON to a supply
 * document plus per-line errors). The prompt text and the error texts are the same as in
 * frontend-admin/features/supply/model/ai/extract-prompt.ts and parse.ts; SupplyPromptsInSyncTest compares the
 * prompt with the TS file symbol by symbol.
 */
public final class SupplyExtract {

    /** Prompt version: goes with the task into the journal to compare reading quality by version. */
    public static final String PROMPT_VERSION = "supply-2";

    public static final String PROMPT = """
            Ты — помощник закупщика интернет-магазина игровой периферии. Я прикладываю документ поставки: накладную / инвойс (PDF или фото) или скриншоты заказа из китайского магазина (Taobao, 1688, Tmall, AliExpress). Перепиши из него все купленные товары в JSON.
            
            ## Как читать
            1. Читай именно изображение документа. В PDF таблица при копировании текстом часто «съезжает» (цвет или вариант оказывается в соседней строке) — сверяйся с тем, как строки стоят на странице, и с суммой строки.
            2. Одна строка ответа = одна позиция документа (товар + вариант/цвет/размер) с её количеством.
            3. Скриншотов может быть несколько, и соседние часто перекрываются: одна и та же позиция видна на двух скринах. Такую позицию пиши ОДИН раз. Признак повтора — тот же магазин, то же название, тот же вариант, та же цена и количество подряд на стыке скринов.
            4. Цена "unitPrice" — за одну штуку, как в документе (на Taobao «¥134.67 ×3» — это 134.67 за штуку и 3 штуки). "lineTotal" — сумма строки, если она написана в документе; если не написана — не пиши поле.
            5. Если на скрине у позиции зачёркнутая и итоговая цена — бери итоговую (что реально заплачено), в "notes" напиши «цена со скидкой».
            6. Доставка, страховка, комиссии, купоны на весь заказ — НЕ строки товаров. Упомяни их в "docNotes".
            7. Текст обрезан многоточием или не читается — пиши, что видно, и отметь это в "notes". Ничего не додумывай: цвет, размер и модель — только если они видны.
            8. Всё, что пишешь своими словами ("notes", "docNotes"), — по-русски: переводи китайские и другие пометки документа, суммы оставляй в валюте документа («доставка ¥4, оплачено ¥562.53»).
            
            ## Поля строки
            - "text": название позиции как в документе, символ в символ, вместе с иероглифами (без названия магазина).
            - "variant": вариант / цвет / размер как в документе (серая строка под названием на Taobao, колонка Model / Color в инвойсе), или null.
            - "en": если "text" или "variant" не на латинице — короткий перевод на английский («ZP1 control mouse pad, Advanced, black, 490×420×4 mm»); иначе null.
            - "brand": бренд латиницей, как пишет производитель (Zpmax, Attack Shark, AULA, ATK), или null.
            - "model": модель латиницей (ZP1 Advanced, R85 HE, X1 Air Ultimate+), или null.
            - "color": цвет по-английски (black, white, teal), или null.
            - "qty": количество, целое число.
            - "unitPrice", "lineTotal": числа в валюте документа, дробная часть через точку, без символов валют.
            - "notes": сомнения по строке или null.
            
            ## Ответ
            Ответь ОДНИМ блоком ```json без пояснений до и после:
            ```json
            {
              "supplier": "название продавца / магазина / фабрики латиницей или по-русски; если в документе иероглифы — перевод и оригинал в скобках: «Xicheng Trade (西城外贸)»; или null",
              "currency": "CNY | USD | EUR | UAH",
              "docNo": "номер инвойса / заказа или null",
              "docDate": "ГГГГ-ММ-ДД или null",
              "total": 1234.5,
              "docNotes": "доставка, скидки на заказ, что не вошло в строки — или null",
              "lines": [
                { "text": "…", "variant": "…", "en": "…", "brand": "…", "model": "…", "color": "…", "qty": 3, "unitPrice": 134.67, "lineTotal": 404.01, "notes": null }
              ]
            }
            ```
            "total" — итог документа за товары (без доставки), если он есть в документе; иначе null.""";

    private static final Map<String, String> CURRENCY = Map.ofEntries(
            Map.entry("¥", "CNY"), Map.entry("RMB", "CNY"), Map.entry("CNY", "CNY"),
            Map.entry("$", "USD"), Map.entry("USD", "USD"), Map.entry("€", "EUR"), Map.entry("EUR", "EUR"),
            Map.entry("₴", "UAH"), Map.entry("UAH", "UAH"), Map.entry("ГРН", "UAH"), Map.entry("ГРН.", "UAH"),
            Map.entry("PLN", "PLN"), Map.entry("ZŁ", "PLN"));

    /**
     * Result of {@link #parse}. {@code doc} is null when no line was read.
     *
     * @param docNotes delivery, order discounts - what did not fit into lines
     * @param notes    what the JSON repair did
     */
    public record Parsed(ExtractedDoc doc, List<String> errors, String docNotes, List<String> notes) {
    }

    private SupplyExtract() {
    }

    public static Parsed parse(String answer) {
        SupplyJson.Result json = SupplyJson.read(answer);
        if (json.error() != null) {
            return new Parsed(null, List.of(json.error()), null, List.of());
        }
        JsonNode v = json.value();
        if (!v.isObject() || !v.path("lines").isArray()) {
            return new Parsed(null, List.of("Нет списка строк \"lines\""), null, json.notes());
        }
        List<String> errors = new ArrayList<>();
        List<SourceLine> lines = new ArrayList<>();
        JsonNode raw = v.get("lines");
        for (int i = 0; i < raw.size(); i++) {
            SourceLine l = lineOf(raw.get(i), i, errors);
            if (l != null) {
                lines.add(l);
            }
        }
        if (lines.isEmpty()) {
            errors.add("Ни одной строки товара");
        }
        ExtractedDoc doc = new ExtractedDoc(str(v.get("supplier")), currencyOf(v.get("currency")), str(v.get("docNo")),
                str(v.get("docDate")), SupplyNumbers.num(v.get("total")), List.copyOf(lines));
        return new Parsed(lines.isEmpty() ? null : doc, errors, str(v.get("docNotes")), json.notes());
    }

    private static SourceLine lineOf(JsonNode raw, int i, List<String> errors) {
        if (!raw.isObject()) {
            errors.add("Строка " + (i + 1) + ": не объект");
            return null;
        }
        String text = str(raw.get("text"));
        if (text == null) {
            text = str(raw.get("en"));
        }
        Double qty = SupplyNumbers.num(raw.get("qty"));
        if (text == null) {
            errors.add("Строка " + (i + 1) + ": нет названия (\"text\")");
            return null;
        }
        if (qty == null || qty < 1 || qty != Math.floor(qty) || qty > Integer.MAX_VALUE) {
            errors.add("Строка " + (i + 1) + " («" + text.substring(0, Math.min(40, text.length()))
                    + "»): количество должно быть целым от 1");
            return null;
        }
        return new SourceLine("L" + (i + 1), text, str(raw.get("variant")), str(raw.get("en")), str(raw.get("brand")),
                str(raw.get("model")), str(raw.get("color")), qty.intValue(), SupplyNumbers.num(raw.get("unitPrice")),
                SupplyNumbers.num(raw.get("lineTotal")), str(raw.get("notes")));
    }

    private static String currencyOf(JsonNode v) {
        String s = str(v);
        return s == null ? null : CURRENCY.get(s.toUpperCase(Locale.ROOT));
    }

    /** A trimmed string or null: not a string, empty and the word "null" all read as no value. */
    static String str(JsonNode v) {
        if (v == null || !v.isTextual()) {
            return null;
        }
        String s = SupplyText.trim(v.asText());
        return s.isEmpty() || s.equalsIgnoreCase("null") ? null : s;
    }
}
