package com.maxsolch.shop.procurement.domain.supplyai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pulls JSON out of an AI answer: a ```json``` block or the outermost {...}; repairs trailing commas and "smart"
 * quotes. Same logic as frontend-admin/features/supply/model/ai/json.ts.
 */
public final class SupplyJson {

    private static final ObjectMapper MAPPER = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    private static final Pattern FENCE = Pattern.compile("```[^\\n`]*\\n?([\\s\\S]*?)```");
    private static final Pattern TRAILING_COMMA = Pattern.compile(",([" + SupplyText.WS + "]*[}\\]])");
    private static final Pattern SMART_QUOTES = Pattern.compile("[“”„‟″]");

    /** value is null when error is set. */
    public record Result(JsonNode value, String error, List<String> notes) {
    }

    private SupplyJson() {
    }

    /** The parsed JSON or null. */
    public static JsonNode extract(String text) {
        return read(text).value();
    }

    public static Result read(String text) {
        String raw = block(text);
        if (raw == null) {
            return new Result(null, "В ответе нет JSON — попросите ИИ ответить одним блоком ```json```", List.of());
        }
        String noCommas = noCommas(raw);
        String smart = noCommas(SMART_QUOTES.matcher(raw).replaceAll("\""));
        String[] texts = {raw, noCommas, smart};
        String[] notes = {null, "убраны висячие запятые", "«умные» кавычки заменены на обычные"};
        String first = null;
        for (int i = 0; i < texts.length; i++) {
            try {
                JsonNode v = MAPPER.readTree(texts[i]);
                if (v != null && !v.isMissingNode()) {
                    return new Result(v, null, notes[i] == null ? List.of() : List.of(notes[i]));
                }
            } catch (JsonProcessingException e) {
                if (first == null) {
                    first = e.getOriginalMessage();
                }
            }
        }
        List<String> none = new ArrayList<>();
        return new Result(null, "JSON не читается: " + first
                + ". Если ответ оборван — попросите ИИ повторить целиком.", none);
    }

    private static String noCommas(String s) {
        return TRAILING_COMMA.matcher(s).replaceAll("$1");
    }

    private static String block(String text) {
        Matcher fence = FENCE.matcher(text);
        if (fence.find() && fence.group(1).contains("{")) {
            return fence.group(1);
        }
        int a = text.indexOf('{');
        int b = text.lastIndexOf('}');
        return a >= 0 && b > a ? text.substring(a, b + 1) : null;
    }
}
