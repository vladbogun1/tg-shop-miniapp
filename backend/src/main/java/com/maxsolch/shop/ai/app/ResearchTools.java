package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.ChatModel.Tool;
import com.maxsolch.shop.ai.domain.ChatModel.ToolCall;
import com.maxsolch.shop.ai.domain.SearchEngine.Hit;

import java.util.List;
import java.util.Map;

/**
 * The model's own research tools — «search» and «open_page» — run by our code instead of MiniMax's paid web_search
 * ($0.01 a query). One instance per request: it counts the budget (the code keeps the limits, not the prompt) and
 * the money the searches cost.
 */
final class ResearchTools {

    static final int SEARCHES_PER_ITEM = 3;
    static final int PAGES_PER_ITEM = 4;
    static final int HITS = 8;

    static final List<Tool> DEFS = List.of(
            new Tool("search", "Поиск в интернете. Возвращает до 8 результатов: заголовок, ссылка, короткий фрагмент. "
                    + "Пиши точный запрос: бренд + модель + specifications.",
                    schema("query")),
            new Tool("open_page", "Открыть страницу по ссылке и получить её текст (до 9000 символов) и главное фото "
                    + "(og:image). Открывай официальный сайт и страницы с таблицей характеристик.",
                    schema("url")));

    private final AiFeature feature;
    private final WebSearch search;
    private final WebPages pages;
    private final int maxSearches;
    private final int maxPages;
    private int searches;
    private int opened;
    /** The model asked beyond a budget: it is told so, and the next turn is the answer. */
    private boolean refused;
    private long costMicroUsd;

    ResearchTools(AiFeature feature, int items, WebSearch search, WebPages pages) {
        this.feature = feature;
        this.search = search;
        this.pages = pages;
        this.maxSearches = SEARCHES_PER_ITEM * items;
        this.maxPages = PAGES_PER_ITEM * items;
    }

    /** The text of the research rules for the prompt, with this request's budget. */
    String rules() {
        return """

                ## Режим API (важнее правил выше, где они расходятся)
                1. Для поиска у тебя инструменты: search и open_page (текст страницы + og:image). Других способов нет.
                2. Бюджет на товар: до %d поисков и до %d открытых страниц (на весь ответ — %d и %d). Порядок: найди \
                официальную страницу товара → открой её → при нехватке данных открой 1–2 страницы крупных магазинов \
                или обзоров с таблицей характеристик.
                3. Значение бери только из открытой страницы именно этой модели и версии (Pro, Ultra, V2, Air — разные \
                товары!). Если характеристика взята со страницы соседней модели или из одного магазина — уверенность ниже 70.
                4. Фото: в "photos" верни 1–3 ссылки на открытые тобой страницы этого товара (официальный сайт первым) \
                или их og:image. Прямые файлы картинок не ищи.
                5. Не ищи на chisetup.com.ua — это наш магазин.
                6. Если у характеристики несколько режимов (частота опроса, скорость сканирования, DPI, время работы) — \
                бери максимальный заявленный производителем.
                7. Как только данных достаточно — сразу отвечай одним блоком ```json.
                """.formatted(SEARCHES_PER_ITEM, PAGES_PER_ITEM, maxSearches, maxPages);
    }

    String run(ToolCall call) {
        return switch (call.name()) {
            case "search" -> search(call.arg("query"));
            case "open_page" -> open(call.arg("url"));
            default -> "Нет такого инструмента: " + call.name();
        };
    }

    /** Both budgets spent, or the model already asked beyond one: the next turn must be the answer. */
    boolean exhausted() {
        return refused || searches >= maxSearches && opened >= maxPages;
    }

    int searches() {
        return searches;
    }

    int pages() {
        return opened;
    }

    long costMicroUsd() {
        return costMicroUsd;
    }

    private String search(String query) {
        if (query.isBlank()) {
            return "Пустой запрос.";
        }
        if (searches >= maxSearches) {
            refused = true;
            return "Лимит поисков исчерпан. Больше не ищи — отвечай по тому, что уже нашёл.";
        }
        searches++;
        WebSearch.Found found = search.search(feature, query, HITS);
        costMicroUsd += found.costMicroUsd();
        if (found.empty()) {
            return "Поиск ничего не вернул. Не угадывай адреса страниц — попробуй другой запрос или отвечай по тому, "
                    + "что уже есть, честно оставив неизвестное пустым.";
        }
        StringBuilder sb = new StringBuilder();
        int i = 1;
        for (Hit h : found.hits()) {
            sb.append(i++).append(". ").append(h.title()).append('\n').append(h.url()).append('\n')
                    .append(h.snippet()).append("\n\n");
        }
        return sb.toString().trim();
    }

    private String open(String url) {
        if (url.isBlank()) {
            return "Пустая ссылка.";
        }
        if (opened >= maxPages) {
            refused = true;
            return "Лимит открытых страниц исчерпан. Отвечай по тому, что уже прочитал.";
        }
        opened++;
        return pages.open(feature, url);
    }

    private static Map<String, Object> schema(String field) {
        return Map.of("type", "object", "properties", Map.of(field, Map.of("type", "string")),
                "required", List.of(field));
    }
}
