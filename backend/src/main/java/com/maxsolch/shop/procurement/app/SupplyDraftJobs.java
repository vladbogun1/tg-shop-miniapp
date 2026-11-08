package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.procurement.domain.SupplyDraft;
import com.maxsolch.shop.procurement.infra.SupplyDraftRepository;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The timer of the supply drafts: every few seconds each running draft makes one move ({@link SupplyDraftPipeline}),
 * one instance for the whole system (ShedLock). A move that throws stops its draft with the reason instead of
 * failing again on every tick; the others go on.
 */
@Slf4j
@Component
public class SupplyDraftJobs {

    private final SupplyDraftRepository drafts;
    private final SupplyDraftPipeline pipeline;

    public SupplyDraftJobs(SupplyDraftRepository drafts, SupplyDraftPipeline pipeline) {
        this.drafts = drafts;
        this.pipeline = pipeline;
    }

    @SchedulerLock(name = "SupplyDraftJobs.tick", lockAtMostFor = "PT2M", lockAtLeastFor = "PT1S")
    @Scheduled(fixedDelayString = "${app.supply-drafts.tick:PT3S}", initialDelayString = "PT20S")
    public void tick() {
        for (Long id : drafts.idsByStatus(SupplyDraft.Status.RUNNING)) {
            try {
                pipeline.advance(id);
            } catch (RuntimeException e) {
                log.warn("supply draft {}: move failed", id, e);
                try {
                    pipeline.crashed(id, e.getClass().getSimpleName());
                } catch (RuntimeException again) {
                    log.warn("supply draft {}: could not mark failed: {}", id, again.toString());
                }
            }
        }
    }
}
