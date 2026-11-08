package com.maxsolch.shop.procurement.domain.supplyai;

import java.util.List;

/**
 * A line under review: the decision so far and the best search candidates (a hint and the input of step 2).
 * Same as ReviewRow in frontend-admin/features/supply/model/ai/types.ts.
 */
public record ReviewRow(SourceLine line, LineDecision decision, List<Candidate> candidates) {

    public ReviewRow {
        candidates = candidates == null ? List.of() : candidates;
    }
}
