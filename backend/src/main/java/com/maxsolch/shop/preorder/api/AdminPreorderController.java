package com.maxsolch.shop.preorder.api;

import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.preorder.app.AdminPreorders;
import com.maxsolch.shop.preorder.app.PreorderCsv;
import com.maxsolch.shop.preorder.app.PreorderDtos.DemandDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.MetricsDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.ReleaseRequest;
import com.maxsolch.shop.preorder.app.PreorderDtos.ReleaseResult;
import com.maxsolch.shop.preorder.app.PreorderDtos.SubscriberDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.List;

/** The queues of «Поставки» in the admin: who waits, «Чего ждут», holds after a restock. Batches are in procurement. */
@RestController
@RequestMapping("/api/admin/preorders")
@RequiredAdmin
@Tag(name = "Admin Preorders", description = "Supply batches, pre-order queues and demand")
@SecurityRequirement(name = "bearer-jwt")
public class AdminPreorderController {

    private final AdminPreorders preorders;

    public AdminPreorderController(AdminPreorders preorders) {
        this.preorders = preorders;
    }

    @GetMapping("/batches/{id}/subscribers")
    @Operation(summary = "Who waits for the lines of a batch")
    public List<SubscriberDto> batchSubscribers(@PathVariable long id) {
        return preorders.batchSubscribers(id);
    }

    @GetMapping("/subscribers")
    @Operation(summary = "Who waits for a product (all variants, or one with variantId), live first")
    public List<SubscriberDto> productSubscribers(@RequestParam String productId,
                                                  @RequestParam(required = false) String variantId) {
        return preorders.productSubscribers(productId, variantId);
    }

    @GetMapping(value = "/batches/{id}/subscribers.csv", produces = "text/csv;charset=utf-8")
    @Operation(summary = "The waiting list of a batch as CSV (UTF-8 with BOM, ';')")
    public ResponseEntity<byte[]> batchSubscribersCsv(@PathVariable long id) {
        return csv(preorders.exportBatchSubscribers(id), "batch-" + id + "-subscribers.csv");
    }

    @GetMapping(value = "/subscribers.csv", produces = "text/csv;charset=utf-8")
    @Operation(summary = "The waiting list of a product (or one variant) as CSV (UTF-8 with BOM, ';')")
    public ResponseEntity<byte[]> productSubscribersCsv(@RequestParam String productId,
                                                        @RequestParam(required = false) String variantId) {
        return csv(preorders.exportProductSubscribers(productId, variantId), "product-subscribers.csv");
    }

    @GetMapping("/metrics")
    @Operation(summary = "Pre-order numbers for a period (Kyiv dates, inclusive)")
    public MetricsDto metrics(@RequestParam String from, @RequestParam String to) {
        return preorders.metrics(from, to);
    }

    @DeleteMapping("/subscriptions/{id}")
    @Operation(summary = "Remove a person from a queue (a held unit goes to the next one)")
    public ResponseEntity<Void> removeSubscriber(@PathVariable long id) {
        preorders.removeSubscriber(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/demand")
    @Operation(summary = "«Чего ждут»: lines with people in the queue, most wanted first")
    public List<DemandDto> demand() {
        return preorders.demand();
    }

    @PostMapping("/demand/release")
    @Operation(summary = "Hand out holds after a restock outside a batch")
    public ReleaseResult release(@RequestBody ReleaseRequest req) {
        return preorders.release(req);
    }

    private static ResponseEntity<byte[]> csv(List<SubscriberDto> rows, String filename) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv;charset=utf-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .body(PreorderCsv.build(rows).getBytes(StandardCharsets.UTF_8));
    }
}
