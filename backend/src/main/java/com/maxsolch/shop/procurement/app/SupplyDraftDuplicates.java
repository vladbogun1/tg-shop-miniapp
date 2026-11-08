package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.ai.app.AiFiles;
import com.maxsolch.shop.ai.domain.AiFile;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.SameInvoice;
import com.maxsolch.shop.procurement.infra.SupplyDraftRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Collection;
import java.util.List;
import java.util.Set;

/**
 * «Эта накладная уже в черновике №N»: before the AI is paid for reading a file, the start screen asks whether the same
 * file (by its content, uploaded again) is in a draft the admin can open — still being checked or already accepted
 * into a batch. A deleted draft does not count: deleting it means «read it again». Only files still kept (7 days)
 * take part, so the question covers the last days.
 */
@Service
public class SupplyDraftDuplicates {

    private final SupplyDraftRepository drafts;
    private final AiFiles files;
    private final CurrentActor actor;
    private final AdminAccess access;
    private final Clock clock;

    SupplyDraftDuplicates(SupplyDraftRepository drafts, AiFiles files, CurrentActor actor, AdminAccess access, Clock clock) {
        this.drafts = drafts;
        this.files = files;
        this.actor = actor;
        this.access = access;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<SameInvoice> sameInvoice(Collection<Long> fileIds) {
        Set<Long> same = files.sameContentAs(fileIds);
        if (same.isEmpty()) {
            return List.of();
        }
        long me = actor.userId();
        boolean finance = access.canSeeFinance(me);
        return drafts.findByCreatedAtAfterOrderByIdDesc(clock.instant().minus(AiFile.KEEP)).stream()
                .filter(d -> d.visibleTo(me, finance))
                .filter(d -> d.fileIdList().stream().anyMatch(same::contains))
                .map(d -> new SameInvoice(d.getId(), d.getTitle(), d.getStatus(), d.getBatchId(), d.getCreatedAt()))
                .toList();
    }
}
