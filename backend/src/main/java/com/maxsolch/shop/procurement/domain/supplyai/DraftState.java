package com.maxsolch.shop.procurement.domain.supplyai;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Everything a supply draft knows, stored as JSON in {@code supply_drafts.state}: the read invoice, the lines with
 * their decisions, the AI tasks of each step, the answers of the cards of new products and the head of the future
 * batch. A new product is named by the id of its first line ({@code L3}), not by its title: the admin may rename it
 * while checking, and its card and price must stay with it.
 */
@Getter
@Setter
public class DraftState {

    /** The invoice as the model read it; null until the reading step is done. */
    private ExtractedDoc doc;
    /** What did not add up while reading (sums, lines without a price) — shown above the lines. */
    private List<String> docNotes = new ArrayList<>();
    private List<ReviewRow> rows = new ArrayList<>();
    /** The model's word on a line (why this product, what it could not find). */
    private Map<String, String> lineNotes = new LinkedHashMap<>();
    /** Steps that did not work but did not stop the draft (matching failed, a card failed, the rate unknown). */
    private List<String> warnings = new ArrayList<>();

    private Long readJob;
    private Long matchJob;
    /** New product (first line id) → its card task. */
    private Map<String, Long> cardJobs = new LinkedHashMap<>();
    /** New product → the card answer ({@code catalog.app.CardDraft} as JSON), once the task is done. */
    private Map<String, JsonNode> cards = new LinkedHashMap<>();
    /** New product → sale price, ₴ (proposed: purchase × rate × 2, the admin may change it). */
    private Map<String, Long> prices = new LinkedHashMap<>();
    /** The admin stopped the AI: no new tasks are started, the draft goes to the check with what it has. */
    private boolean stopped;

    private Long supplierId;
    private String supplierName;
    private String currency;
    private BigDecimal fxRate;
    private String title;
    private int etaWeeks = 3;
    private boolean preorderOpen = true;

    public void warn(String text) {
        if (!warnings.contains(text)) {
            warnings.add(text);
        }
    }

    public List<ReviewRow> openRows() {
        return rows.stream().filter(r -> "open".equals(r.decision().kind())).toList();
    }
}
