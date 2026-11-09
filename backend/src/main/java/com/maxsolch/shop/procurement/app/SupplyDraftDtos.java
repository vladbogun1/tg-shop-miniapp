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
    /** A draft that already has the same invoice file (uploaded again): open it instead of paying for the AI twice. */
    public record SameInvoice(long id, @Nullable String title, SupplyDraft.Status status, @Nullable Long batchId,
                              Instant createdAt) {
    }

    public record DraftCreateRequest(List<Long> fileIds) {
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
     * @param key   CARD: the new product it is for (the same key as in {@code cards} and {@code prices})
     * @param step  what a running task does now («Ищу: …»)
     * @param costMinor kopecks, only for the finance right
     */
    public record DraftJobView(@Schema(allowableValues = {"READ", "VERIFY", "MATCH", "CARD"}) String kind, @Nullable String key, String label, long jobId,
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
                           int etaWeeks, boolean preorderOpen, List<DraftJobView> jobs, @Nullable Long costMinor,
                           DraftSumInfo sum) {
    }

    /**
     * How the reading was brought to the document total (the sum itself the screen counts from the lines).
     *
     * @param rereads        thorough rereads of the invoice (on its own and by «Перечитать»)
     * @param removedRepeats lines dropped as screenshot overlaps
     */
    public record DraftSumInfo(int rereads, List<String> removedRepeats) {
    }

    /** A line the admin adds by hand (the reading missed it); money in the document currency. */
    public record ManualLine(String text, @Nullable String variant, int qty, @Nullable Double unitPrice) {
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
     * @param addLines     lines the reading missed — added open, ids «M1», «M2»…
     * @param removeLines  lines taken out of the document (an overlap the code kept, a foreign position); unlike
     *                     «skip» they no longer count in the sum
     */
    public record DraftSaveRequest(long version, @Nullable Map<String, LineDecision> decisions,
                              @Nullable Map<String, Long> prices, @Nullable Map<String, String> descriptions,
                              @Nullable Long supplierId, @Nullable String supplierName, @Nullable String currency,
                              @Nullable BigDecimal fxRate, @Nullable String title, @Nullable Integer etaWeeks,
                              @Nullable Boolean preorderOpen, @Nullable List<ManualLine> addLines,
                              @Nullable List<String> removeLines) {

        /** Without lines to add or take out (the older screens and tests). */
        public DraftSaveRequest(long version, Map<String, LineDecision> decisions, Map<String, Long> prices,
                                Map<String, String> descriptions, Long supplierId, String supplierName, String currency,
                                BigDecimal fxRate, String title, Integer etaWeeks, Boolean preorderOpen) {
            this(version, decisions, prices, descriptions, supplierId, supplierName, currency, fxRate, title, etaWeeks,
                    preorderOpen, null, null);
        }
    }

    public record DraftAcceptRequest(long version) {
    }

    public record DraftAcceptResult(long batchId, int newProducts) {
    }
}
