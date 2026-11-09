package com.maxsolch.shop.procurement.domain.supplyai;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Screenshot overlaps. The model writes every line of every screenshot (it used to drop «repeats» itself and threw
 * away real purchases that only looked alike); here a line is a doubtful repeat when the previous screenshot has the
 * same line (text, variant, price, quantity). Which of them really are repeats decides the document total: the
 * combination that adds up wins. Without a total, or when no combination adds up, all of them are dropped — an
 * identical line on the next screenshot is an overlap far more often than a second purchase — and the total check
 * of the draft takes it from there.
 */
public final class SupplySeams {

    /**
     * @param doc     the document without the dropped lines (ids stay: «L4» is still the fourth line read)
     * @param shots   the screenshot of each kept line
     * @param removed what was dropped, for the admin («ZP1 黑色 · 2 × 100 (скрин 2)»)
     */
    public record Result(ExtractedDoc doc, List<Integer> shots, List<String> removed) {
    }

    private SupplySeams() {
    }

    public static Result resolve(ExtractedDoc doc, List<Integer> shots) {
        List<SourceLine> lines = doc.lines();
        List<Integer> doubtful = doubtful(lines, shots);
        if (doubtful.isEmpty()) {
            return new Result(doc, shots, List.of());
        }
        Set<Integer> drop = Set.copyOf(choose(lines, doubtful, doc.total()));
        List<SourceLine> kept = new ArrayList<>();
        List<Integer> keptShots = new ArrayList<>();
        List<String> removed = new ArrayList<>();
        for (int i = 0; i < lines.size(); i++) {
            if (drop.contains(i)) {
                removed.add(label(lines.get(i), shotAt(shots, i)));
            } else {
                kept.add(lines.get(i));
                keptShots.add(shotAt(shots, i));
            }
        }
        ExtractedDoc next = new ExtractedDoc(doc.supplier(), doc.currency(), doc.docNo(), doc.docDate(), doc.total(), List.copyOf(kept));
        return new Result(next, keptShots, List.copyOf(removed));
    }

    /**
     * Indexes of lines that repeat a line of the previous screenshot; each earlier line explains one repeat. When the
     * model gave no screenshot numbers, any identical later line is doubtful.
     */
    static List<Integer> doubtful(List<SourceLine> lines, List<Integer> shots) {
        boolean numbered = shots.stream().anyMatch(Objects::nonNull);
        Map<String, List<Integer>> free = new HashMap<>();
        List<Integer> out = new ArrayList<>();
        for (int j = 0; j < lines.size(); j++) {
            String key = key(lines.get(j));
            Integer shot = shotAt(shots, j);
            List<Integer> earlier = free.computeIfAbsent(key, k -> new ArrayList<>());
            Integer pair = earlier.stream()
                    .filter(i -> !numbered || (shot != null && Objects.equals(shotAt(shots, i), shot - 1)))
                    .findFirst().orElse(null);
            if (pair != null) {
                earlier.remove(pair);
                out.add(j);
            } else {
                earlier.add(j);
            }
        }
        return out;
    }

    private static List<Integer> choose(List<SourceLine> lines, List<Integer> doubtful, Double total) {
        if (total == null) {
            return doubtful;
        }
        double all = SupplyChecks.linesSum(lines);
        List<Double> amounts = doubtful.stream().map(i -> SupplySubsets.amount(lines.get(i))).toList();
        Set<Integer> picked = SupplySubsets.closest(all, amounts, total, -1);
        double sum = all - picked.stream().mapToDouble(amounts::get).sum();
        if (!SupplyChecks.close(sum, total)) {
            return doubtful;
        }
        return picked.stream().map(doubtful::get).toList();
    }

    private static String key(SourceLine l) {
        return SupplyText.sourceKey(l.text(), l.variant()) + "|" + SupplyText.num(l.unitPrice()) + "|" + l.qty();
    }

    private static Integer shotAt(List<Integer> shots, int i) {
        return i < shots.size() ? shots.get(i) : null;
    }

    static String label(SourceLine l, Integer shot) {
        String name = l.variant() == null ? l.text() : l.text() + " · " + l.variant();
        return name + " — " + l.qty() + " × " + SupplyText.num(l.unitPrice()) + (shot == null ? "" : " (скрин " + shot + ")");
    }
}
