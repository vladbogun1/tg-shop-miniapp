package com.maxsolch.shop.procurement.domain.supplyai;

import java.util.List;

/**
 * The best reading of the invoice so far, kept in the draft while the AI rereads it (the screenshot overlaps already
 * dropped): if a reread is worse or fails, the draft goes on with this one.
 *
 * @param removed  lines dropped as screenshot overlaps, for the admin
 * @param errors   what the parser refused (lines without a name or a quantity)
 * @param docNotes delivery, order discounts — the model's words
 */
public record ReadCandidate(ExtractedDoc doc, List<Integer> shots, List<String> removed, List<String> errors,
                            String docNotes) {

    public ReadCandidate {
        shots = shots == null ? List.of() : shots;
        removed = removed == null ? List.of() : removed;
        errors = errors == null ? List.of() : errors;
    }

    public static ReadCandidate of(SupplyExtract.Parsed read, SupplySeams.Result seams) {
        return new ReadCandidate(seams.doc(), seams.shots(), seams.removed(), read.errors(), read.docNotes());
    }

    public SupplyExtract.Parsed toParsed() {
        return new SupplyExtract.Parsed(doc, errors, docNotes, List.of(), shots);
    }
}
