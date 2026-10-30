package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.preorder.domain.PreorderError;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.preorder.app.PreorderDtos.DemandDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.MetricsDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.ReleaseRequest;
import com.maxsolch.shop.preorder.app.PreorderDtos.ReleaseResult;
import com.maxsolch.shop.preorder.app.PreorderDtos.SubscriberDto;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;

/**
 * What the admin does with pre-order queues, one method per button: runs the scenario of {@link PreorderQueueAdmin}
 * and writes the audit entry after its transaction has committed (and the export of personal data is audited too).
 * The controller only turns the request into these arguments.
 */
@Service
public class AdminPreorders {

    private final PreorderQueueAdmin admin;
    private final AdminAuditService audit;

    public AdminPreorders(PreorderQueueAdmin admin, AdminAuditService audit) {
        this.admin = admin;
        this.audit = audit;
    }

    public List<SubscriberDto> batchSubscribers(long id) {
        return admin.subscribersOfBatch(id);
    }

    public List<SubscriberDto> productSubscribers(String productId, String variantId) {
        return admin.subscribersOfProduct(productId, variantId);
    }

    /** The waiting list of a batch for a file: the export of personal data is audited. */
    public List<SubscriberDto> exportBatchSubscribers(long id) {
        List<SubscriberDto> rows = admin.subscribersOfBatch(id);
        audit.record("PREORDER_SUBSCRIBERS_EXPORT", "PREORDER_BATCH", String.valueOf(id), rows.size() + " чел., CSV");
        return rows;
    }

    public List<SubscriberDto> exportProductSubscribers(String productId, String variantId) {
        List<SubscriberDto> rows = admin.subscribersOfProduct(productId, variantId);
        audit.record("PREORDER_SUBSCRIBERS_EXPORT", "PRODUCT", productId, rows.size() + " чел., CSV");
        return rows;
    }

    /** The period comes as text of the request; a malformed date is a 400. */
    public MetricsDto metrics(String from, String to) {
        try {
            return admin.metrics(LocalDate.parse(from), LocalDate.parse(to));
        } catch (DateTimeParseException e) {
            throw new DomainException.BadRequest(PreorderError.BAD_PERIOD);
        }
    }

    public void removeSubscriber(long id) {
        admin.removeSubscriber(id, audit.currentAdminName());
        audit.record("PREORDER_SUBSCRIPTION_REMOVE", "PREORDER_SUBSCRIPTION", String.valueOf(id), null);
    }

    public List<DemandDto> demand() {
        return admin.demand();
    }

    public ReleaseResult release(ReleaseRequest req) {
        ReleaseResult result = admin.release(req);
        audit.record("PREORDER_RELEASE", "PRODUCT", req.productId(),
                "бронь у " + result.heldPeople() + " чел., " + result.heldQty() + " шт.");
        return result;
    }
}
