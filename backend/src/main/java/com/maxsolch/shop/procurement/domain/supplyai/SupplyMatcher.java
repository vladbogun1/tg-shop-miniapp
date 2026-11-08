package com.maxsolch.shop.procurement.domain.supplyai;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import static com.maxsolch.shop.procurement.domain.supplyai.SupplyText.words;

/**
 * Matching document lines with the catalog without AI: first supplier memory (exact line key), then search by
 * words - brand (without spaces and case), model code (letters and digits; bare numbers are sizes and counts), the
 * kind of thing ({@link SupplyKinds}), colour. Colours are usually separate products for us, so a foreign colour in the
 * title is penalised. Same logic as frontend-admin/features/supply/model/ai/match.ts.
 */
public final class SupplyMatcher {

    /** English colour to the word stems as they are written in our titles and variants. */
    private static final Map<String, List<String>> COLORS = colors();
    private static final Set<String> ALL_STEMS = allStems();
    private static final Pattern DIGIT = Pattern.compile("\\d");
    private static final Pattern LETTER = Pattern.compile("[a-zа-яіїєґ]");
    private static final Pattern SIZE =Pattern.compile("\\d{3,}|\\d+mm");
    private static final int LIMIT = 8;

    /** Decision for one line plus the candidates (a hint and the input of step 2). */
    public record Auto(LineDecision decision, List<Candidate> candidates) {
    }

    private SupplyMatcher() {
    }

    private static Map<String, List<String>> colors() {
        Map<String, List<String>> c = new LinkedHashMap<>();
        c.put("black", List.of("черн", "чорн", "black"));
        c.put("white", List.of("бел", "біл", "white"));
        c.put("red", List.of("красн", "червон", "red"));
        c.put("blue", List.of("син", "blue"));
        c.put("green", List.of("зел", "green"));
        c.put("pink", List.of("розов", "рожев", "pink"));
        c.put("purple", List.of("фиолет", "фіолет", "purple", "violet"));
        c.put("grey", List.of("сер", "сір", "grey", "gray"));
        c.put("teal", List.of("бирюз", "бірюз", "teal", "cyan", "turquoise"));
        c.put("orange", List.of("оранж", "помаран", "orange"));
        c.put("yellow", List.of("желт", "жовт", "yellow"));
        c.put("silver", List.of("серебр", "срібн", "silver"));
        c.put("gray", c.get("grey"));
        c.put("violet", c.get("purple"));
        c.put("turquoise", c.get("teal"));
        c.put("cyan", c.get("teal"));
        return c;
    }

    private static Set<String> allStems() {
        Set<String> s = new LinkedHashSet<>();
        COLORS.values().forEach(s::addAll);
        return s;
    }

    private static boolean hasDigit(String w) {
        return DIGIT.matcher(w).find();
    }

    private static boolean stemIn(Collection<String> stems, List<String> ws) {
        for (String w : ws) {
            for (String s : stems) {
                if (w.startsWith(s)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static List<String> colorStems(SourceLine l) {
        List<String> ws = new ArrayList<>(words(l.color()));
        ws.addAll(words(l.en()));
        ws.addAll(words(l.variant()));
        Set<String> out = new LinkedHashSet<>();
        for (String w : ws) {
            List<String> stems = COLORS.get(w);
            if (stems != null) {
                out.addAll(stems);
            }
        }
        return new ArrayList<>(out);
    }

    /** Words the line is searched by: Latin and digits of brand, model, translation, text and variant. */
    private static List<String> lineWords(SourceLine l) {
        Set<String> out = new LinkedHashSet<>();
        for (String x : new String[] {l.brand(), l.model(), l.en(), l.text(), l.variant()}) {
            out.addAll(words(x));
        }
        return new ArrayList<>(out);
    }

    /** Model codes: model words (or all words with digits) without sizes such as 490 / 420 / 4mm. */
    private static List<String> modelWords(SourceLine l) {
        List<String> src = new ArrayList<>();
        if (l.model() != null && !l.model().isEmpty()) {
            src.addAll(words(l.model()));
        } else {
            lineWords(l).stream().filter(SupplyMatcher::hasDigit).forEach(src::add);
        }
        src.removeIf(w -> SIZE.matcher(w).matches());
        return src;
    }

    private static double productScore(SourceLine l, CatalogItem p) {
        Set<String> pw = new LinkedHashSet<>(words(p.title()));
        pw.addAll(words(p.brand()));
        List<String> lw = lineWords(l);
        double score = 0;
        for (String m : modelWords(l)) {
            if (pw.contains(m)) {
                score += !hasDigit(m) ? 1.5 : isCode(m) ? 3 : 1;
            } else if (isCode(m)) {
                score -= 2;
            }
        }
        // A model code the product has and the line has not (ZP2 for a ZP1 line) is another product. Bare numbers
        // (6.5 mm, 30 pcs, 0.55) are sizes and counts: they add when they match and take nothing when they do not.
        for (String w : pw) {
            if (isCode(w) && !lw.contains(w)) {
                score -= 1.5;
            }
        }
        if (sameBrand(l, p, pw)) {
            score += 2;
        }
        List<String> titleWords = words(p.title());
        if (SupplyKinds.sameKind(l, titleWords)) {
            score += 1.5;
        }
        List<String> colors = colorStems(l);
        if (!colors.isEmpty()) {
            if (stemIn(colors, titleWords)) {
                score += 1;
            } else if (stemIn(ALL_STEMS, titleWords) && p.variants().isEmpty()) {
                score -= 1.5;
            }
        }
        return score;
    }

    /** A model code has letters and digits (zp1, v2, r85, 8k); a bare number is a size or a count. */
    private static boolean isCode(String w) {
        return hasDigit(w) && LETTER.matcher(w).find();
    }

    /** The brand without spaces and case: «WEST LAB» is «WestLab»; inside the title only for 4+ letters. */
    private static boolean sameBrand(SourceLine l, CatalogItem p, Set<String> pw) {
        List<String> bw = words(l.brand());
        if (bw.isEmpty()) {
            return false;
        }
        String b = String.join("", bw);
        return pw.containsAll(bw) || b.equals(String.join("", words(p.brand())))
                || (b.length() >= 4 && String.join("", words(p.title())).contains(b));
    }

    /** The variant that looks most like the line's variant / colour / size; null - no variant or not guessed. */
    public static String pickVariant(SourceLine l, CatalogItem p) {
        if (p.variants().isEmpty()) {
            return null;
        }
        List<String> lw = new ArrayList<>(words(l.variant()));
        lw.addAll(words(l.color()));
        lw.addAll(words(l.en()));
        List<String> colors = colorStems(l);
        String bestId = null;
        int bestScore = 0;
        for (CatalogItem.Variant v : p.variants()) {
            List<String> vw = words(v.name());
            int s = (int) vw.stream().filter(lw::contains).count() * 2;
            if (!colors.isEmpty() && stemIn(colors, vw)) {
                s += 1;
            }
            if (s > 0 && (bestId == null || s > bestScore)) {
                bestId = v.id();
                bestScore = s;
            }
        }
        return bestId;
    }

    public static List<Candidate> candidatesOf(SourceLine l, List<CatalogItem> catalog) {
        List<Candidate> all = new ArrayList<>();
        for (CatalogItem p : catalog) {
            double score = productScore(l, p);
            if (score > 0) {
                all.add(new Candidate(p.id(), pickVariant(l, p), score));
            }
        }
        all.sort((a, b) -> Double.compare(b.score(), a.score()));
        return List.copyOf(all.subList(0, Math.min(LIMIT, all.size())));
    }

    /** The AI short list as the candidates of the line: in its order, each with the variant that looks like the line. */
    public static List<Candidate> shortList(SourceLine l, List<String> productIds, List<CatalogItem> catalog) {
        Map<String, CatalogItem> byId = index(catalog);
        List<Candidate> out = new ArrayList<>();
        for (int i = 0; i < productIds.size(); i++) {
            CatalogItem p = byId.get(productIds.get(i));
            if (p != null) {
                out.add(new Candidate(p.id(), pickVariant(l, p), productIds.size() - i, true));
            }
        }
        return List.copyOf(out);
    }

    /** Confident search: a clear leader, with a variant when the product has them. */
    private static Candidate confident(List<Candidate> cands, Map<String, CatalogItem> byId) {
        if (cands.isEmpty() || cands.get(0).score() < 5) {
            return null;
        }
        Candidate top = cands.get(0);
        if (cands.size() > 1 && top.score() - cands.get(1).score() < 2) {
            return null;
        }
        CatalogItem p = byId.get(top.productId());
        if (p != null && !p.variants().isEmpty() && top.variantId() == null) {
            return null;
        }
        return top;
    }

    private static LineDecision fromMemory(SourceLine l, Map<String, SupplierAlias> memory, Map<String, CatalogItem> byId) {
        SupplierAlias a = memory.get(SupplyText.sourceKey(l.text(), l.variant()));
        CatalogItem p = a == null ? null : byId.get(a.productId());
        if (a == null || p == null) {
            return null;
        }
        boolean hasVariant = a.variantId() != null && !a.variantId().isEmpty();
        boolean broken = hasVariant
                ? p.variants().stream().noneMatch(v -> v.id().equals(a.variantId()))
                : !p.variants().isEmpty();
        return broken ? null : LineDecision.match(a.productId(), a.variantId(), "memory");
    }

    /** Initial decision for one line and the candidates. */
    public static Auto autoMatch(SourceLine l, List<CatalogItem> catalog, List<SupplierAlias> memory) {
        return autoMatch(l, catalog, index(catalog), memoryIndex(memory));
    }

    /** Initial rows for all lines without supplier memory. */
    public static List<ReviewRow> autoMatch(List<SourceLine> lines, List<CatalogItem> catalog) {
        return autoMatch(lines, catalog, List.of());
    }

    /** Initial rows for all lines: memory first, then search. */
    public static List<ReviewRow> autoMatch(List<SourceLine> lines, List<CatalogItem> catalog, List<SupplierAlias> memory) {
        Map<String, CatalogItem> byId = index(catalog);
        Map<String, SupplierAlias> mem = memoryIndex(memory);
        List<ReviewRow> rows = new ArrayList<>();
        for (SourceLine l : lines) {
            Auto a = autoMatch(l, catalog, byId, mem);
            rows.add(new ReviewRow(l, a.decision(), a.candidates()));
        }
        return rows;
    }

    /**
     * Applies supplier memory to rows that are not decided by a person: open rows and rows matched by search
     * (memory is stronger than search). Rows decided by admin / AI / skip / new stay as they are.
     */
    public static List<ReviewRow> applyMemory(List<ReviewRow> rows, List<SupplierAlias> memory, List<CatalogItem> catalog) {
        Map<String, CatalogItem> byId = index(catalog);
        Map<String, SupplierAlias> mem = memoryIndex(memory);
        List<ReviewRow> out = new ArrayList<>();
        for (ReviewRow r : rows) {
            LineDecision d = r.decision();
            boolean replaceable = "open".equals(d.kind()) || ("match".equals(d.kind()) && "search".equals(d.by()));
            LineDecision remembered = replaceable ? fromMemory(r.line(), mem, byId) : null;
            out.add(remembered == null ? r : new ReviewRow(r.line(), remembered, r.candidates()));
        }
        return out;
    }

    private static Auto autoMatch(SourceLine l, List<CatalogItem> catalog, Map<String, CatalogItem> byId,
                                  Map<String, SupplierAlias> mem) {
        List<Candidate> candidates = candidatesOf(l, catalog);
        LineDecision remembered = fromMemory(l, mem, byId);
        if (remembered != null) {
            return new Auto(remembered, candidates);
        }
        Candidate top = confident(candidates, byId);
        if (top != null) {
            return new Auto(LineDecision.match(top.productId(), top.variantId(), "search"), candidates);
        }
        return new Auto(LineDecision.open(), candidates);
    }

    private static Map<String, CatalogItem> index(List<CatalogItem> catalog) {
        Map<String, CatalogItem> m = new LinkedHashMap<>();
        catalog.forEach(p -> m.put(p.id(), p));
        return m;
    }

    private static Map<String, SupplierAlias> memoryIndex(List<SupplierAlias> memory) {
        Map<String, SupplierAlias> m = new LinkedHashMap<>();
        memory.forEach(a -> m.put(a.sourceKey(), a));
        return m;
    }
}
