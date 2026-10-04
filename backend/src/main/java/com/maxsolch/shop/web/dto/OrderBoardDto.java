package com.maxsolch.shop.web.dto;

import java.util.List;
import java.util.Map;

/**
 * Kanban board payload. {@code columns} holds capped per-status cards (newest first), while
 * {@code counts} holds the true total order count per status (status name -> count) within the same
 * time range + q filter, so totals are accurate even when a column is capped. {@code sums} is the
 * true money total per status under the same filter (minor units) — the column used to add up only
 * the cards it had loaded.
 */
public record OrderBoardDto(Map<String, List<OrderCardDto>> columns,
                            Map<String, Long> counts,
                            Map<String, Long> sums) {
}
