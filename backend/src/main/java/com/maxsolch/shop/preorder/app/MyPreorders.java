package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.preorder.app.PreorderDtos.MyPreorderDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.ProductPreorderDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.SubscribeRequest;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * What a customer does with the queues (Mini App and site): sees their places, joins, leaves. Knows who is
 * acting ({@link CurrentActor}), where they came from (the source of the place) and writes the journal entry of
 * joining; the queue itself is {@link PreorderQueueService}. Not {@code @Transactional}: the journal never
 * rolls a place back.
 */
@Service
public class MyPreorders {

    private final PreorderQueueService queue;
    private final CurrentActor actor;
    private final ActivityLog activity;

    public MyPreorders(PreorderQueueService queue, CurrentActor actor, ActivityLog activity) {
        this.queue = queue;
        this.actor = actor;
        this.activity = activity;
    }

    public List<MyPreorderDto> list() {
        return queue.listMine(actor.userId());
    }

    public ProductPreorderDto forProduct(String productId) {
        return queue.forProduct(productId, actor.userId());
    }

    /** Join the queue (again = change the quantity); the journal gets a line, and a journal failure is ignored. */
    public MyPreorderDto join(SubscribeRequest req) {
        String source = actor.principal().isWeb()
                ? PreorderQueueService.SOURCE_WEB : PreorderQueueService.SOURCE_MINIAPP;
        MyPreorderDto dto = queue.subscribe(actor.userId(), source, req);
        try {
            activity.record(ActivityLog.fromRequest("PREORDER_JOIN")
                    .text("Встал в очередь на «" + dto.productTitle() + "»"
                            + (dto.variantName() == null ? "" : " (" + dto.variantName() + ")")
                            + ", " + dto.qty() + " шт."));
        } catch (RuntimeException ignored) {
            // the journal never breaks the request
        }
        return dto;
    }

    public void leave(long id) {
        queue.unsubscribe(actor.userId(), id);
    }
}
