package com.maxsolch.shop.procurement.domain.supplyai;

import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Document arithmetic: price x quantity = line total, sum of lines = document total, lines that look like a
 * screenshot overlap. Same logic and message texts as frontend-admin/features/supply/model/ai/checks.ts.
 */
public final class SupplyChecks {

    private SupplyChecks() {
    }

    /** Up to 1 % (and at least 0.02) is the seller's rounding, not a reading error. */
    public static boolean close(double a, double b) {
        return Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.01);
    }

    /** To kopecks / fen: an amount in the document currency. */
    public static double round2(double n) {
        if (!Double.isFinite(n)) {
            return 0;
        }
        return Math.round(n * 100) / 100.0;
    }

    /** Arithmetic problem of a line or null. */
    public static String lineProblem(SourceLine l) {
        if (l.unitPrice() == null) {
            return "нет цены";
        }
        if (l.lineTotal() != null && !close(l.unitPrice() * l.qty(), l.lineTotal())) {
            return SupplyText.num(l.unitPrice()) + " × " + l.qty() + " = " + SupplyText.num(round2(l.unitPrice() * l.qty()))
                    + ", а в документе " + SupplyText.num(l.lineTotal());
        }
        return null;
    }

    public static double linesSum(List<SourceLine> lines) {
        double sum = 0;
        for (SourceLine l : lines) {
            sum += (l.unitPrice() == null ? 0 : l.unitPrice()) * l.qty();
        }
        return round2(sum);
    }

    public static String totalProblem(ExtractedDoc doc) {
        return totalProblem(doc, doc.lines());
    }

    /** Document total against the sum of lines; null - it matches or there is no total. */
    public static String totalProblem(ExtractedDoc doc, List<SourceLine> lines) {
        if (doc.total() == null) {
            return null;
        }
        double sum = linesSum(lines);
        if (close(sum, doc.total())) {
            return null;
        }
        return "сумма строк " + SupplyText.num(sum) + ", а итог документа " + SupplyText.num(doc.total())
                + " (разница " + SupplyText.num(round2(doc.total() - sum)) + ")";
    }

    /** Ids of lines preceded by an identical one (text, variant, price, quantity): most likely screenshot overlap. */
    public static Set<String> likelyRepeats(List<SourceLine> lines) {
        Set<String> seen = new HashSet<>();
        Set<String> out = new LinkedHashSet<>();
        for (SourceLine l : lines) {
            String k = SupplyText.sourceKey(l.text(), l.variant()) + "|" + SupplyText.num(l.unitPrice()) + "|" + l.qty();
            if (!seen.add(k)) {
                out.add(l.id());
            }
        }
        return out;
    }
}
