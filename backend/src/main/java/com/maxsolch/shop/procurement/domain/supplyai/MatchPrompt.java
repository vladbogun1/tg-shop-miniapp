package com.maxsolch.shop.procurement.domain.supplyai;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Step 2 of "Supply with AI": only the lines search could not match confidently, with the 8 nearest catalog
 * products each. The AI decides: one of the candidates or a new product. The prompt size depends on the number of
 * undecided lines, not on the catalog. Same text and logic as frontend-admin/features/supply/model/ai/match-prompt.ts
 * (a golden file taken from the TS build is compared in MatchPromptTest).
 */
public final class MatchPrompt {

    /** Step 2 prompt version - in the task of the built-in AI, so metrics tell text changes apart. */
    public static final String PROMPT_VERSION = "supply-match-1";

    private static final String HEAD = """
            Ты — контент-менеджер магазина игровой периферии ChiSetup. Ниже строки документа поставки (накладная или заказ из китайского магазина), которые я не смог уверенно сопоставить с нашим каталогом. К каждой — до 8 похожих товаров каталога.

            ## Задача
            Для каждой строки реши:
            1. Это один из кандидатов → верни его ключ "product" (p…) и, если у товара есть варианты, точное название варианта "variant" из списка.
               Это тот же товар, только если совпадают бренд, модель и версия (V2, Pro, Ultra, Mini, 8K — разные товары) и цвет. Разный цвет у нас — разные товары, если цвета нет среди вариантов.
            2. Подходящего нет → "new": новый товар. Найди модель в интернете (официальный сайт производителя, затем крупные магазины), чтобы назвать точно.
               - "title": по-русски — родовое слово + бренд + модель + цвет, бренд и модель латиницей, как у производителя («Коврик Zpmax ZP1 Advanced 490×420 чёрный», «Клавиатура Attack Shark R85 HE белая»). Размер коврика — если он часть модели.
               - "variant": только размер одежды / перчаток / рукавов (M, L, XL), иначе null. Цвет — часть названия, не вариант.
               - "brand": как пишет производитель.
               - "category": slug категории из списка ниже.
               - "source": ссылка на страницу, по которой ты опознал модель, или null.
            3. Не уверен → "new" с лучшим названием и пояснение в "notes". Ничего не выдумывай.

            ## Категории (slug — название)
            """;

    private static final String TAIL = """


            ## Ответ
            ОДИН блок ```json без пояснений, ключ — номер строки:
            ```json
            {
              "L1": { "product": "p1a2b3c4d", "variant": null, "notes": null },
              "L2": { "new": { "title": "…", "variant": null, "brand": "…", "category": "slug", "source": "https://…" }, "notes": "…" }
            }
            ```""";

    /** Result of {@link #parse}: decisions and AI notes by line id (upper case), and errors in Russian. */
    public record Result(Map<String, LineDecision> decisions, Map<String, String> notes, List<String> errors) {
    }

    private MatchPrompt() {
    }

    /**
     * Subject of a built-in AI task: the set of undecided lines (id + text + variant). The same set twice is "already
     * running", not a second paid task. FNV-1a 32 bit twice with different seeds: 16 hex characters.
     */
    public static String subject(List<ReviewRow> rows) {
        String text = rows.stream()
                .map(r -> r.line().id() + "|" + r.line().text() + "|" + (r.line().variant() == null ? "" : r.line().variant()))
                .collect(Collectors.joining(";"));
        return "m" + fnv(text, 0x811c9dc5) + fnv(text, 0x9747b28c);
    }

    private static String fnv(String text, int seed) {
        int h = seed;
        for (int i = 0; i < text.length(); i++) {
            h ^= text.charAt(i);
            h *= 0x01000193;
        }
        return String.format("%08x", h);
    }

    /** Short product key in the prompt: "p" + the first 8 characters of the id without dashes. */
    public static String shortId(String id) {
        String s = id.replace("-", "");
        return "p" + s.substring(0, Math.min(8, s.length()));
    }

    public static String build(List<ReviewRow> openRows, List<CatalogItem> catalog, List<LeafCategory> categories) {
        Map<String, CatalogItem> byId = new LinkedHashMap<>();
        catalog.forEach(p -> byId.put(p.id(), p));
        String cats = categories.stream().map(c -> "- " + c.slug() + " — " + c.name()).collect(Collectors.joining("\n"));
        String rows = openRows.stream().map(r -> lineBlock(r, byId)).collect(Collectors.joining("\n\n"));
        return HEAD + cats + "\n\n## Строки\n" + rows + TAIL;
    }

    private static String lineBlock(ReviewRow r, Map<String, CatalogItem> byId) {
        SourceLine l = r.line();
        List<String> head = new ArrayList<>(List.of("### " + l.id() + ": " + l.text()));
        if (l.variant() != null && !l.variant().isEmpty()) {
            head.add("вариант: " + l.variant());
        }
        if (l.en() != null && !l.en().isEmpty()) {
            head.add("перевод: " + l.en());
        }
        List<String> cands = new ArrayList<>();
        for (Candidate c : r.candidates()) {
            CatalogItem p = byId.get(c.productId());
            if (p != null) {
                cands.add(candidateLine(p));
            }
        }
        return String.join("\n", head) + "\nКандидаты из нашего каталога:\n"
                + (cands.isEmpty() ? "- (нет похожих)" : String.join("\n", cands));
    }

    private static String candidateLine(CatalogItem p) {
        String brand = p.brand() != null && !p.brand().isEmpty() ? " | " + p.brand() : "";
        String variants = p.variants().isEmpty() ? ""
                : " | варианты: " + p.variants().stream().map(CatalogItem.Variant::name).collect(Collectors.joining(", "));
        return "- " + shortId(p.id()) + " | " + p.title() + brand + variants;
    }

    /**
     * Parses the AI answer. When {@code openRows} is not empty, answers for lines that are not among them are
     * rejected with an error (the AI must not rewrite lines already decided); an empty list means no such check.
     */
    public static Result parse(String answer, List<ReviewRow> openRows, List<CatalogItem> catalog,
                               List<LeafCategory> categories) {
        Map<String, LineDecision> decisions = new LinkedHashMap<>();
        Map<String, String> notes = new LinkedHashMap<>();
        List<String> errors = new ArrayList<>();
        SupplyJson.Result json = SupplyJson.read(answer);
        if (json.error() != null || !json.value().isObject()) {
            errors.add(json.error() != null ? json.error() : "Ответ — не объект {\"L1\": …}");
            return new Result(decisions, notes, errors);
        }
        Set<String> open = new HashSet<>();
        openRows.forEach(r -> open.add(r.line().id().toUpperCase(Locale.ROOT)));
        for (Iterator<Map.Entry<String, JsonNode>> it = json.value().fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> e = it.next();
            String id = e.getKey().toUpperCase(Locale.ROOT);
            JsonNode raw = e.getValue();
            if (!raw.isObject()) {
                continue;
            }
            if (!open.isEmpty() && !open.contains(id)) {
                errors.add(id + ": такой строки нет среди нерешённых");
                continue;
            }
            LineDecision d = decisionOf(id, raw, catalog, categories, errors);
            if (d != null) {
                decisions.put(id, d);
            }
            String note = SupplyExtract.str(raw.get("notes"));
            if (note != null) {
                notes.put(id, note);
            }
        }
        return new Result(decisions, notes, errors);
    }

    private static NewProductDraft draftOf(JsonNode raw, List<LeafCategory> categories) {
        String title = SupplyExtract.str(raw.get("title"));
        if (title == null) {
            return null;
        }
        String slug = SupplyExtract.str(raw.get("category"));
        String categoryId = categories.stream().filter(c -> c.slug().equals(slug)).map(LeafCategory::id).findFirst().orElse(null);
        return new NewProductDraft(title, SupplyExtract.str(raw.get("brand")), categoryId,
                SupplyExtract.str(raw.get("variant")), SupplyExtract.str(raw.get("source")));
    }

    private static LineDecision decisionOf(String id, JsonNode raw, List<CatalogItem> catalog,
                                           List<LeafCategory> categories, List<String> errors) {
        JsonNode fresh = raw.get("new");
        if (fresh != null && fresh.isObject()) {
            NewProductDraft draft = draftOf(fresh, categories);
            if (draft == null) {
                errors.add(id + ": у нового товара нет названия");
                return null;
            }
            return LineDecision.fresh(draft);
        }
        String product = SupplyExtract.str(raw.get("product"));
        String key = product == null ? null : product.toLowerCase(Locale.ROOT);
        CatalogItem p = key == null ? null : catalog.stream().filter(x -> shortId(x.id()).equals(key)).findFirst().orElse(null);
        if (p == null) {
            errors.add(id + ": товар " + (key == null ? "—" : key) + " не из списка кандидатов");
            return null;
        }
        String vName = SupplyExtract.str(raw.get("variant"));
        String want = vName == null ? null : vName.toLowerCase(Locale.ROOT);
        CatalogItem.Variant v = want == null ? null
                : p.variants().stream().filter(x -> x.name().toLowerCase(Locale.ROOT).equals(want)).findFirst().orElse(null);
        if (!p.variants().isEmpty() && v == null) {
            JsonNode shown = raw.get("variant");
            errors.add(id + ": у «" + p.title() + "» нет варианта «"
                    + (shown == null || shown.isNull() ? "" : shown.asText()) + "» — выберите вручную");
            return null;
        }
        return LineDecision.match(p.id(), v == null ? null : v.id(), "ai");
    }
}
