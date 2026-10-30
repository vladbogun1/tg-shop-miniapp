package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.procurement.domain.ProcurementError;
import com.maxsolch.shop.procurement.app.BatchDtos.EtaDto;
import com.maxsolch.shop.procurement.domain.PreorderBatch;
import com.maxsolch.shop.procurement.domain.PreorderBatchItem;
import com.maxsolch.shop.procurement.infra.PreorderBatchItemRepository;
import com.maxsolch.shop.procurement.infra.PreorderBatchRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * Read side of batches for the modules above procurement (the pre-order queue, the margin report): which batches
 * are on the way, what lines they bring and when they are expected. Nobody outside procurement reads the batch
 * repositories directly.
 */
@Service
public class BatchCatalog {

    private static final List<String> OPEN = List.of(PreorderBatch.Status.ORDERED.name(),
            PreorderBatch.Status.IN_TRANSIT.name(), PreorderBatch.Status.CUSTOMS.name());

    /** A line of a batch customers can see (on the way, pre-order open) with its batch. */
    public record PublicLine(PreorderBatchItem item, PreorderBatch batch) {
    }

    private final PreorderBatchRepository batches;
    private final PreorderBatchItemRepository items;

    public BatchCatalog(PreorderBatchRepository batches, PreorderBatchItemRepository items) {
        this.batches = batches;
        this.items = items;
    }

    public Optional<PreorderBatch> find(long id) {
        return batches.findById(id);
    }

    public PreorderBatch require(long id) {
        return batches.findById(id).orElseThrow(() -> new DomainException.NotFound(ProcurementError.BATCH_NOT_FOUND_BY_ID, String.valueOf(id)));
    }

    /** Batches still on the way (ordered, in transit, at customs), newest first. */
    public List<PreorderBatch> openBatches() {
        return batches.findByStatusInOrderByCreatedAtDesc(OPEN);
    }

    public List<PreorderBatchItem> linesOf(long batchId) {
        return items.findByBatchIdOrderByIdAsc(batchId);
    }

    public List<PreorderBatchItem> linesOfBatches(Collection<Long> batchIds) {
        return items.findByBatchIdIn(batchIds);
    }

    /** Units that arrived through batches marked arrived in [from, to). */
    public long arrivedUnitsBetween(Instant from, Instant to) {
        return items.arrivedBetween(from, to);
    }

    /** Lines of batches customers can see. */
    public List<PublicLine> publicLines() {
        return items.findPublicLines().stream().map(BatchCatalog::publicLine).toList();
    }

    /** The same, for one product. */
    public List<PublicLine> publicLines(byte[] productId) {
        return items.findPublicLines(productId).stream().map(BatchCatalog::publicLine).toList();
    }

    private static PublicLine publicLine(Object[] row) {
        return new PublicLine((PreorderBatchItem) row[0], (PreorderBatch) row[1]);
    }

    /** When goods are expected, as the customer sees it (the batch is still on the way). */
    public static EtaDto eta(PreorderBatch b, LocalDate today) {
        PreorderBatch.EtaMode mode = b.etaModeEnum();
        boolean hidden = mode == PreorderBatch.EtaMode.HIDDEN;
        return new EtaDto(b.statusEnum() == PreorderBatch.Status.ORDERED ? "ordered" : "in_transit",
                mode.name(),
                hidden ? null : b.getEtaFrom(),
                hidden || mode == PreorderBatch.EtaMode.DATE ? null : b.getEtaTo(),
                mode == PreorderBatch.EtaMode.APPROX ? com.maxsolch.shop.procurement.domain.BatchEta.approxWeeks(b.getEtaTo(), today) : null,
                b.getPublicNote());
    }
}
