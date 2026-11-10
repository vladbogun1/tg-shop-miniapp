package com.maxsolch.shop.translation.infra;

import com.maxsolch.shop.translation.domain.SourceHash;
import com.maxsolch.shop.translation.domain.TranslationGlossary.Term;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * The one DeepL glossary of the shop (API v3: both pairs ru→uk and ru→en in one glossary — the free plan allows a single
 * glossary). Its name carries a hash of the entries: a changed {@code TranslationGlossary.TERMS} gives a new name, the
 * client creates that glossary and deletes the old ones with the same prefix. Also the fixes of DeepL's answer.
 */
final class DeepLGlossary {

    static final String PREFIX = "chisetup-";
    private static final List<String> TARGETS = List.of("uk", "en");
    private static final Pattern LONG_NUMBER = Pattern.compile("\\d{4,}");
    private static final Pattern GROUPS = Pattern.compile("\\B(?=(\\d{3})+(?!\\d))");

    private DeepLGlossary() {
    }

    /** TSV entries per target language; a language without terms is left out (DeepL refuses an empty dictionary). */
    static Map<String, String> dictionaries(List<Term> terms) {
        Map<String, String> out = new LinkedHashMap<>();
        for (String lang : TARGETS) {
            String tsv = terms.stream()
                    .filter(t -> target(t, lang) != null)
                    .map(t -> t.ru().strip() + "\t" + target(t, lang).strip())
                    .collect(Collectors.joining("\n"));
            if (!tsv.isEmpty()) {
                out.put(lang, tsv);
            }
        }
        return out;
    }

    static String name(Map<String, String> dictionaries) {
        return PREFIX + SourceHash.sha256Hex(dictionaries.toString()).substring(0, 12);
    }

    static Map<String, Object> createBody(String name, Map<String, String> dictionaries) {
        List<Map<String, String>> dicts = new ArrayList<>();
        dictionaries.forEach((lang, tsv) -> dicts.add(Map.of(
                "source_lang", "ru", "target_lang", lang, "entries", tsv, "entries_format", "tsv")));
        return Map.of("name", name, "dictionaries", dicts);
    }

    /**
     * DeepL writes «8000» as «8,000» in English. The shop keeps numbers as in the Russian source (the specs, the old
     * translations), and the answer check counts the numbers of the source — a grouped one reads as lost.
     */
    static String ungroupNumbers(String source, String answer) {
        String out = answer;
        // longest first: «18,000» must not lose its «8,000» to the shorter number
        for (String n : LONG_NUMBER.matcher(source).results().map(m -> m.group()).distinct()
                .sorted(Comparator.comparingInt(String::length).reversed()).toList()) {
            out = out.replace(GROUPS.matcher(n).replaceAll(","), n);
        }
        return out;
    }

    private static String target(Term t, String lang) {
        return "uk".equals(lang) ? t.uk() : t.en();
    }
}
