package com.maxsolch.shop.procurement.domain.supplyai;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Step 2 of "Supply with AI": the lines search could not match confidently, with the whole catalog (not archived,
 * hidden ones marked) and the search hint for each line. The AI decides: a product of the catalog, «one of these —
 * the invoice does not say which» (the line stays open with the AI's short list) or a new product. The catalog goes
 * before the lines, so that part of the prompt is the same for every draft and the model's cache takes it. Same text
 * and logic as frontend-admin/features/supply/model/ai/match-prompt.ts (a golden file taken from the TS build is
 * compared in SupplyPromptsInSyncTest).
 */
public final class MatchPrompt {

    /** Step 2 prompt version - in the task of the built-in AI, so metrics tell text changes apart. */
    public static final String PROMPT_VERSION = "supply-match-2";

    private static final String HEAD = """
            Ты — контент-менеджер магазина игровой периферии ChiSetup. Ниже весь наш каталог и строки документа поставки (накладная или заказ из китайского магазина), которые я не смог уверенно сопоставить с каталогом. К каждой строке — подсказка поиска: до 8 похожих товаров.

            ## Задача
            Для каждой строки реши:
            1. Это товар из нашего каталога → верни его ключ "product" (p…) и, если у товара есть варианты, точное название варианта "variant" из списка.
               Ищи по всему каталогу, не только в подсказке: в накладной товар часто назван иначе (WESTLAB, West Lab и WestLab — один бренд; «mouse feet» — наши «Глайды», «anti-slip» и «grip tape» — «Грипсы»).
               Это тот же товар, только если совпадают бренд, модель и версия (V2, Pro, Ultra, Mini, 8K — разные товары) и цвет. Разный цвет у нас — разные товары, если цвета нет среди вариантов. Товар с пометкой «скрыт» тоже наш, его просто нет на витрине.
            2. Модель у нас есть, но по накладной не понять, какой именно это товар (не указан цвет, размер или версия) → "choose": ключи подходящих товаров, самый вероятный первым, а в "notes" — чего не хватает. Строку решит человек.
            3. Этой модели у нас нет ни в каком цвете и версии → "new": новый товар. Найди модель в интернете (официальный сайт производителя, затем крупные магазины), чтобы назвать точно.
               - "title": по-русски — родовое слово + бренд + модель + цвет, бренд и модель латиницей, как у производителя («Коврик Zpmax ZP1 Advanced 490×420 чёрный», «Клавиатура Attack Shark R85 HE белая»). Размер коврика — если он часть модели.
               - "variant": только размер одежды / перчаток / рукавов (M, L, XL), иначе null. Цвет — часть названия, не вариант.
               - "brand": как пишет производитель.
               - "category": slug категории из списка ниже.
               - "source": ссылка на страницу, по которой ты опознал модель, или null.
            4. Не уверен, есть ли модель у нас → "choose" с самыми близкими товарами. Уверен, что модели нет, но не уверен в названии → "new" с лучшим названием и пояснение в "notes". Ничего не выдумывай.

            ## Категории (slug — название)
            """;

    private static final String CATALOG_HEAD = """


            ## Наш каталог
            ключ | название | бренд, если его нет в названии | варианты | скрыт

            """;

    private static final String TAIL = """


            ## Ответ
            ОДИН блок ```json без пояснений, ключ — номер строки:
            ```json
            {
              "L1": { "product": "p1a2b3c4d", "variant": null, "notes": null },
              "L2": { "choose": ["p1a2b3c4d", "p5e6f7a8b"], "notes": "в накладной не указан цвет" },
              "L3": { "new": { "title": "…", "variant": null, "brand": "…", "category": "slug", "source": "https://…" }, "notes": "…" }
            }
            ```""";

    /**
     * Result of {@link #parse}, by line id (upper case): decisions, the AI's short lists for lines it could not pin
     * down (product ids, the likeliest first), its notes, and errors in Russian.
     */
    public record Result(Map<String, LineDecision> decisions, Map<String, List<String>> choices, Map<String, String> notes,
                         List<String> errors) {
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
        return HEAD + cats + CATALOG_HEAD + catalogBlock(catalog, categories) + "\n\n## Строки\n" + rows + TAIL;
    }

    /** Products by leaf category in the tree order, by title inside one; products of no leaf go last. */
    private static String catalogBlock(List<CatalogItem> catalog, List<LeafCategory> categories) {
        Map<String, List<CatalogItem>> byCategory = new LinkedHashMap<>();
        categories.forEach(c -> byCategory.put(c.id(), new ArrayList<>()));
        List<CatalogItem> other = new ArrayList<>();
        for (CatalogItem p : catalog) {
            List<CatalogItem> group = p.categoryId() == null ? null : byCategory.get(p.categoryId());
            (group == null ? other : group).add(p);
        }
        List<String> groups = new ArrayList<>();
        categories.forEach(c -> group(groups, c.name(), byCategory.get(c.id())));
        group(groups, "Без категории", other);
        return groups.isEmpty() ? "- (каталог пуст)" : String.join("\n\n", groups);
    }

    private static void group(List<String> out, String name, List<CatalogItem> items) {
        if (items.isEmpty()) {
            return;
        }
        String lines = items.stream().sorted(Comparator.comparing(CatalogItem::title).thenComparing(CatalogItem::id))
                .map(MatchPrompt::catalogLine).collect(Collectors.joining("\n"));
        out.add("### " + name + "\n" + lines);
    }

    private static String catalogLine(CatalogItem p) {
        boolean brandInTitle = p.brand() == null || p.brand().isEmpty()
                || p.title().toLowerCase(Locale.ROOT).contains(p.brand().toLowerCase(Locale.ROOT));
        String variants = p.variants().isEmpty() ? ""
                : " | варианты: " + p.variants().stream().map(CatalogItem.Variant::name).collect(Collectors.joining(", "));
        return "- " + shortId(p.id()) + " | " + p.title() + (brandInTitle ? "" : " | " + p.brand()) + variants
                + (p.hidden() ? " | скрыт" : "");
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
        List<String> hint = new ArrayList<>();
        for (Candidate c : r.candidates()) {
            CatalogItem p = byId.get(c.productId());
            if (p != null) {
                hint.add("- " + shortId(p.id()) + " | " + p.title());
            }
        }
        return String.join("\n", head) + "\nПодсказка поиска:\n"
                + (hint.isEmpty() ? "- (поиск ничего не нашёл)" : String.join("\n", hint));
    }

    /** What {@link #parse} collects while it goes through the lines. */
    private record Answer(Map<String, CatalogItem> byKey, List<LeafCategory> categories, Map<String, List<String>> choices,
                          List<String> errors) {

        CatalogItem product(String id, JsonNode key) {
            String k = SupplyExtract.str(key);
            String lower = k == null ? null : k.toLowerCase(Locale.ROOT);
            CatalogItem p = lower == null ? null : byKey.get(lower);
            if (p == null) {
                errors.add(id + ": товара " + (lower == null ? "—" : lower) + " нет в каталоге");
            }
            return p;
        }
    }

    /**
     * Parses the AI answer. When {@code openRows} is not empty, answers for lines that are not among them are
     * rejected with an error (the AI must not rewrite lines already decided); an empty list means no such check.
     */
    public static Result parse(String answer, List<ReviewRow> openRows, List<CatalogItem> catalog,
                               List<LeafCategory> categories) {
        Map<String, LineDecision> decisions = new LinkedHashMap<>();
        Map<String, String> notes = new LinkedHashMap<>();
        Map<String, CatalogItem> byKey = new LinkedHashMap<>();
        catalog.forEach(p -> byKey.putIfAbsent(shortId(p.id()), p));
        Answer a = new Answer(byKey, categories, new LinkedHashMap<>(), new ArrayList<>());
        SupplyJson.Result json = SupplyJson.read(answer);
        if (json.error() != null || !json.value().isObject()) {
            a.errors().add(json.error() != null ? json.error() : "Ответ — не объект {\"L1\": …}");
            return new Result(decisions, a.choices(), notes, a.errors());
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
                a.errors().add(id + ": такой строки нет среди нерешённых");
                continue;
            }
            LineDecision d = decisionOf(id, raw, a);
            if (d != null) {
                decisions.put(id, d);
            }
            String note = SupplyExtract.str(raw.get("notes"));
            if (note != null) {
                notes.put(id, note);
            }
        }
        return new Result(decisions, a.choices(), notes, a.errors());
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

    /** A decision for the line, or null: a new product without a title, an unknown product, or a short list. */
    private static LineDecision decisionOf(String id, JsonNode raw, Answer a) {
        JsonNode fresh = raw.get("new");
        if (fresh != null && fresh.isObject()) {
            NewProductDraft draft = draftOf(fresh, a.categories());
            if (draft == null) {
                a.errors().add(id + ": у нового товара нет названия");
                return null;
            }
            return LineDecision.fresh(draft);
        }
        JsonNode choose = raw.get("choose");
        if (choose != null && choose.isArray()) {
            List<String> ids = new ArrayList<>();
            choose.forEach(k -> {
                CatalogItem p = a.product(id, k);
                if (p != null && !ids.contains(p.id())) {
                    ids.add(p.id());
                }
            });
            if (!ids.isEmpty()) {
                a.choices().put(id, List.copyOf(ids));
            }
            return null;
        }
        CatalogItem p = a.product(id, raw.get("product"));
        if (p == null) {
            return null;
        }
        String vName = SupplyExtract.str(raw.get("variant"));
        String want = vName == null ? null : vName.toLowerCase(Locale.ROOT);
        CatalogItem.Variant v = want == null ? null
                : p.variants().stream().filter(x -> x.name().toLowerCase(Locale.ROOT).equals(want)).findFirst().orElse(null);
        if (!p.variants().isEmpty() && v == null) {
            JsonNode shown = raw.get("variant");
            a.errors().add(id + ": у «" + p.title() + "» нет варианта «"
                    + (shown == null || shown.isNull() ? "" : shown.asText()) + "» — выберите вручную");
            return null;
        }
        return LineDecision.match(p.id(), v == null ? null : v.id(), "ai");
    }
}
