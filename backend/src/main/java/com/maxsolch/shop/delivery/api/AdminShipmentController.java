package com.maxsolch.shop.delivery.api;

import com.maxsolch.shop.delivery.app.ShipmentAdmin;
import com.maxsolch.shop.delivery.app.ShipmentCommands;
import com.maxsolch.shop.order.app.OrderShipmentView.ShipmentBrief;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;

/**
 * Nova Poshta waybills from the admin: the parcel of one order (preview, create, edit, cancel, «Обновить») and the
 * «К отправке» batch + one label PDF. Label PDFs are fetched by the server: the API key is part of NP's print URL
 * and never reaches the browser.
 */
@RestController
@RequestMapping("/api/admin")
@RequiredAdmin
@Tag(name = "Admin shipments", description = "Nova Poshta waybills and labels")
@SecurityRequirement(name = "bearer-jwt")
public class AdminShipmentController {

    private final ShipmentAdmin shipments;

    public AdminShipmentController(ShipmentAdmin shipments) {
        this.shipments = shipments;
    }

    /** {@code senderWarehouseRef}: quick choice of the sending branch for the whole batch (null = default). */
    public record BatchRequest(List<String> orderIds, String senderWarehouseRef) {
    }

    @PostMapping("/orders/{id}/shipment/refresh")
    @Operation(summary = "Ask Nova Poshta for the parcel status now")
    public ShipmentBrief refresh(@PathVariable String id) {
        return shipments.refresh(id);
    }

    @PostMapping("/orders/{id}/shipment/preview")
    @Operation(summary = "What «Створити ТТН» would send (recipient, box, money, price), with the admin's changes")
    public ShipmentCommands.Preview preview(@PathVariable String id,
                                           @RequestBody(required = false) ShipmentCommands.Options options) {
        return shipments.preview(id, options);
    }

    @PostMapping("/orders/{id}/shipment")
    @Operation(summary = "Create the waybill at Nova Poshta (the order stays until NP accepts the parcel)")
    public ShipmentBrief create(@PathVariable String id,
                                @RequestBody(required = false) ShipmentCommands.Options options) {
        return shipments.create(id, options);
    }

    @PutMapping("/orders/{id}/shipment")
    @Operation(summary = "Change the waybill (weight, box, value, sender branch) before NP accepts the parcel")
    public ShipmentBrief update(@PathVariable String id,
                                @RequestBody(required = false) ShipmentCommands.Options options) {
        return shipments.update(id, options);
    }

    @DeleteMapping("/orders/{id}/shipment")
    @Operation(summary = "Cancel the waybill (deleted at NP; a typed-in one is only forgotten)")
    public void cancel(@PathVariable String id) {
        shipments.cancel(id);
    }

    @PostMapping("/shipments/batch")
    @Operation(summary = "«Створити ТТН для всіх»: a waybill with defaults for each order")
    public List<ShipmentCommands.BatchResult> batch(@RequestBody BatchRequest body) {
        return shipments.createAll(body == null ? null : body.orderIds(),
                body == null ? null : body.senderWarehouseRef());
    }

    @GetMapping(value = "/shipments/labels", produces = MediaType.APPLICATION_PDF_VALUE)
    @Operation(summary = "One PDF with the labels of these orders (format 100x100 | 85x85 | a4)")
    public ResponseEntity<byte[]> labels(@RequestParam String orderIds,
                                         @RequestParam(defaultValue = "100x100") String format) {
        List<String> ids = Arrays.stream(orderIds.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
        ShipmentCommands.Labels labels = shipments.labels(ids, format);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename("np-labels-" + labels.count() + ".pdf").build().toString())
                .header("X-Labels-Count", String.valueOf(labels.count()))
                .header("X-Dry-Run", String.valueOf(labels.dryRun()))
                // Typed-in or not-ours numbers NP cannot print (a header is ASCII).
                .header("X-Labels-Skipped", String.join(",", labels.skipped().stream()
                        .map(t -> t == null ? "" : t.replaceAll("[^0-9A-Za-z-]", "")).filter(t -> !t.isEmpty())
                        .limit(20).toList()))
                .body(labels.pdf());
    }
}
