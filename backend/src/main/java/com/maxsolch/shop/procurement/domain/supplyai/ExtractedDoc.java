package com.maxsolch.shop.procurement.domain.supplyai;

import java.util.List;

/**
 * What the AI read from a supply document. Same shape as ExtractedDoc in
 * frontend-admin/features/supply/model/ai/types.ts.
 *
 * @param docNo   document / order number - goes to the supply note
 * @param total   document total for goods, when the document has one
 * @param title   the AI's name of the supply («Taobao · X-Raypad — коврики и глайды»), see {@link SupplyTitle}
 */
public record ExtractedDoc(
        String supplier,
        String currency,
        String docNo,
        String docDate,
        Double total,
        List<SourceLine> lines,
        String title) {

    /** The same document with other lines. */
    public ExtractedDoc withLines(List<SourceLine> next) {
        return new ExtractedDoc(supplier, currency, docNo, docDate, total, next, title);
    }
}
