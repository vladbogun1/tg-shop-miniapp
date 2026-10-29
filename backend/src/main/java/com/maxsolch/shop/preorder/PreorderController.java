package com.maxsolch.shop.preorder;

import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.preorder.PreorderDtos.MyPreorderDto;
import com.maxsolch.shop.preorder.PreorderDtos.ProductPreorderDto;
import com.maxsolch.shop.preorder.PreorderDtos.SubscribeRequest;
import com.maxsolch.shop.platform.web.SecurityUtil;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Customer side of pre-orders (Mini App and site): join / leave a queue, «Мої очікування». */
@RestController
@RequestMapping("/api/me/preorders")
@Tag(name = "Preorders", description = "Waitlist for goods that are out of stock or on their way")
@SecurityRequirement(name = "bearer-jwt")
@PreAuthorize("hasRole('CUSTOMER')")
public class PreorderController {

    private final PreorderQueueService queue;

    /** «Журнал → Бот и сайт»: joining a queue. */
    @Autowired(required = false)
    private ActivityLog activity;

    public PreorderController(PreorderQueueService queue) {
        this.queue = queue;
    }

    @GetMapping
    @Operation(summary = "My places in queues: live first, then recent history")
    public List<MyPreorderDto> list() {
        return queue.listMine(SecurityUtil.currentUserId());
    }

    @GetMapping("/product/{productId}")
    @Operation(summary = "Pre-order block of a product page, with my places in its queues")
    public ProductPreorderDto forProduct(@PathVariable String productId) {
        return queue.forProduct(productId, SecurityUtil.currentUserId());
    }

    @PostMapping
    @Operation(summary = "Join the queue for an out-of-stock product/variant (again = change the quantity)")
    public MyPreorderDto subscribe(@RequestBody SubscribeRequest req) {
        String source = SecurityUtil.currentPrincipal().isWeb()
                ? PreorderQueueService.SOURCE_WEB : PreorderQueueService.SOURCE_MINIAPP;
        MyPreorderDto dto = queue.subscribe(SecurityUtil.currentUserId(), source, req);
        if (activity != null) {
            try {
                activity.record(ActivityLog.fromRequest("PREORDER_JOIN")
                        .text("Встал в очередь на «" + dto.productTitle() + "»"
                                + (dto.variantName() == null ? "" : " (" + dto.variantName() + ")")
                                + ", " + dto.qty() + " шт."));
            } catch (RuntimeException ignored) {
                // the journal never breaks the request
            }
        }
        return dto;
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Leave a queue (a held unit goes to the next person)")
    public ResponseEntity<Void> unsubscribe(@PathVariable long id) {
        queue.unsubscribe(SecurityUtil.currentUserId(), id);
        return ResponseEntity.noContent().build();
    }
}
