package com.maxsolch.shop.procurement.domain.supplyai;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The second look at an invoice whose lines do not add up to its total: the same pictures, the same reading prompt,
 * plus what was read and how much is missing — the model rereads slower (a thorough task) and answers the whole list
 * again. Which reading to keep and what a reread adds to a draft already being checked is decided here, by the total.
 */
public final class SupplyVerify {

    public static final String PROMPT_VERSION = "supply-verify-1";
    /** Rereads the draft does on its own after the first reading; the admin may ask for more («Перечитать»). */
    public static final int AUTO_ATTEMPTS = 2;

    private SupplyVerify() {
    }

    /** The lines agree with the total (or there is no total to check against). */
    public static boolean agrees(ExtractedDoc doc, List<SourceLine> lines) {
        return doc.total() == null || SupplyChecks.close(SupplyChecks.linesSum(lines), doc.total());
    }

    /** How far the lines are from the total; 0 without a total. */
    public static double gap(ExtractedDoc doc, List<SourceLine> lines) {
        return doc.total() == null ? 0 : Math.abs(doc.total() - SupplyChecks.linesSum(lines));
    }

    /** Of two readings of the same pictures — the one closer to its total; on a tie the later (more thorough) one. */
    public static boolean laterIsBetter(ExtractedDoc earlier, ExtractedDoc later) {
        if (later.total() == null && earlier.total() != null) {
            return false;
        }
        return gap(later, later.lines()) <= gap(earlier, earlier.lines());
    }

    public static String prompt(ExtractedDoc doc, List<SourceLine> lines, List<Integer> shots) {
        StringBuilder b = new StringBuilder(SupplyExtract.PROMPT).append("\n\n## Перепроверка\n");
        b.append("Этот документ уже прочитали, но ").append(problem(doc, lines)).append(".\n");
        b.append("Вот что прочитали (текст | вариант | количество × цена | скрин):\n");
        for (int i = 0; i < lines.size(); i++) {
            SourceLine l = lines.get(i);
            Integer shot = i < shots.size() ? shots.get(i) : null;
            b.append("- ").append(l.text()).append(" | ").append(l.variant() == null ? "—" : l.variant()).append(" | ")
                    .append(l.qty()).append(" × ").append(SupplyText.num(l.unitPrice())).append(" | ")
                    .append(shot == null ? "?" : shot).append('\n');
        }
        b.append("""

                Перечитай изображения ещё раз, медленно, строку за строкой, и ответь ПОЛНЫМ исправленным списком в том же \
                формате JSON (все строки, а не только исправления). Проверь: не пропущена ли строка — особенно две похожие \
                позиции подряд, они часто отличаются только основой или упаковкой и это разные покупки; количество и цену \
                каждой строки; итог документа. Если всё равно не сходится — напиши в "docNotes", где расхождение.""");
        return b.toString();
    }

    /** «сумма строк 14 788,17, а итог документа 16 007,7 (разница 1 219,53)» or a plain wording without a total. */
    static String problem(ExtractedDoc doc, List<SourceLine> lines) {
        String p = SupplyChecks.totalProblem(doc, lines);
        return p != null ? p : "закупщик сомневается, что все строки прочитаны";
    }

    /**
     * A reread of a draft under check: the lines it has that the draft has not (by text, variant, price and quantity)
     * — only those that bring the draft to its total; without a total — all of them. Lines of the draft are never
     * taken away here: the admin has decided them.
     */
    public static List<SourceLine> missing(List<SourceLine> have, List<SourceLine> reread, Double total) {
        Map<String, Integer> left = new HashMap<>();
        have.forEach(l -> left.merge(key(l), 1, Integer::sum));
        List<SourceLine> extra = new ArrayList<>();
        for (SourceLine l : reread) {
            if (left.merge(key(l), -1, Integer::sum) < 0) {
                extra.add(l);
            }
        }
        if (total == null || extra.isEmpty()) {
            return extra;
        }
        List<Double> amounts = extra.stream().map(SupplySubsets::amount).toList();
        Set<Integer> picked = SupplySubsets.closest(SupplyChecks.linesSum(have), amounts, total, +1);
        return picked.stream().map(extra::get).toList();
    }

    private static String key(SourceLine l) {
        return SupplyText.sourceKey(l.text(), l.variant()) + "|" + SupplyText.num(l.unitPrice()) + "|" + l.qty();
    }
}
