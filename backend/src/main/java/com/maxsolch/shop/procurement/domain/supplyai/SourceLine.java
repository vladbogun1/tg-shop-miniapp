package com.maxsolch.shop.procurement.domain.supplyai;

/**
 * One document line as the AI read it (step 1). Money is in the document currency, not minor units.
 * Same shape as SourceLine in frontend-admin/features/supply/model/ai/types.ts.
 *
 * @param id        "L1", "L2"... - the line number in the answer; step 2 answers by it
 * @param text      the line as written in the document (with hieroglyphs) - the supplier-memory key
 * @param variant   variant / colour / size as in the document
 * @param en        English translation when the document is not Latin
 */
public record SourceLine(
        String id,
        String text,
        String variant,
        String en,
        String brand,
        String model,
        String color,
        int qty,
        Double unitPrice,
        Double lineTotal,
        String notes) {
}
