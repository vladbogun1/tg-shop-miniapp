package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.catalog.app.CardDraft;
import com.maxsolch.shop.procurement.domain.SupplyDraft;
import com.maxsolch.shop.procurement.domain.supplyai.ExtractedDoc;
import com.maxsolch.shop.procurement.domain.supplyai.LineDecision;
import com.maxsolch.shop.procurement.domain.supplyai.ReviewRow;
import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.lang.Nullable;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** What the admin screens of the supply drafts send and get. */
public final class SupplyDraftDtos {

    private SupplyDraftDtos() {
    }

    /** The pictures of the invoice (ids from {@code POST /api/admin/ai/files}). */
    public record CreateRequest(List<Long> fileIds) {
    }

    /** A row of the list «Черновики ИИ». */
    public record DraftSummary(long id, SupplyDraft.Status status, SupplyDraft.Step step, @Nullable String title,
                               @Nullable String failure, int lines, int newProducts, int open, Instant createdAt,
                               Instant updatedAt, @Nullable Instant readyAt) {
    }

    /**
     * One AI task of the draft as the progress shows it.
     *
     * @param kind  READ (the invoice), MATCH (the open lines), CARD (a new product's card)
     * @param step  what a running task does now («Ищу: …»)
     * @param costMinor kopecks, only for the finance right
     */
    public record JobView(@Schema(allowableValues = {"READ", "MATCH", "CARD"}) String kind, String label, long jobId,
                          String status, @Nullable String step, @Nullable String error, @Nullable Long costMinor) {
    }

    /**
     * The whole draft. {@code cards} and {@code prices} are by the key of a new product — the id of its first line
     * (or of the line that holds its card): see {@code newProductKey} on the screen.
     */
    public record DraftDto(long id, long version, SupplyDraft.Status status, SupplyDraft.Step step, @Nullable String title,
                           @Nullable String failure, @Nullable Long batchId, Instant createdAt, @Nullable Instant readyAt,
                           @Nullable ExtractedDoc doc, List<String> docNotes, List<ReviewRow> rows,
                           Map<String, String> lineNotes, List<String> warnings, Map<String, CardDraft> cards,
                           Map<String, Long> prices, boolean stopped, @Nullable Long supplierId,
                           @Nullable String supplierName, @Nullable String currency, @Nullable BigDecimal fxRate,
                           int etaWeeks, boolean preorderOpen, List<JobView> jobs, @Nullable Long costMinor) {
    }

    /**
     * The admin's corrections on the check screen; null fields stay as they are. {@code version} — the version the
     * screen saw: an older one is refused (another tab changed the draft).
     *
     * @param decisions    line id → its decision (as on the screen)
     * @param prices       new product key → sale price, ₴
     * @param supplierId   a known supplier; 0 — a new one, created on accept by {@code supplierName}
     * @param descriptions new product key → the Russian description as the admin edited it (the AI translations of it
     *                     are dropped: the translation step makes new ones)
     */
    public record SaveRequest(long version, @Nullable Map<String, LineDecision> decisions,
                              @Nullable Map<String, Long> prices, @Nullable Map<String, String> descriptions,
                              @Nullable Long supplierId, @Nullable String supplierName, @Nullable String currency,
                              @Nullable BigDecimal fxRate, @Nullable String title, @Nullable Integer etaWeeks,
                              @Nullable Boolean preorderOpen) {
    }

    public record AcceptRequest(long version) {
    }

    public record AcceptResult(long batchId, int newProducts) {
    }
}
