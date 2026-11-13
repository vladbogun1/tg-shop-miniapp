package com.maxsolch.shop.delivery.api;

import com.maxsolch.shop.delivery.app.PackingCommands.Check;
import com.maxsolch.shop.delivery.app.PackingCommands.ConfirmBox;
import com.maxsolch.shop.delivery.app.PackingCommands.Confirmed;
import com.maxsolch.shop.delivery.app.PackingConfirmation;
import com.maxsolch.shop.delivery.app.PackingJournal;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Packing: «Подтвердить коробку» of an order's waybill and the «Журнал упаковки». */
@RestController
@RequestMapping("/api/admin/np")
@RequiredAdmin
@Tag(name = "Admin NP packing", description = "Confirm the real box of a parcel, the packing journal")
@SecurityRequirement(name = "bearer-jwt")
public class AdminPackingController {

    private final PackingConfirmation confirmation;
    private final PackingJournal journal;

    public AdminPackingController(PackingConfirmation confirmation, PackingJournal journal) {
        this.confirmation = confirmation;
        this.journal = journal;
    }

    @PostMapping("/shipments/{orderId}/box")
    @Operation(summary = "«Подтвердить коробку»: record the real box; a waybill NP has no parcel for is changed "
            + "(a printed one is remade — ttnNumberChanged); without a waybill it is made now — ttnCreated")
    public Confirmed confirmBox(@PathVariable String orderId, @RequestBody ConfirmBox body) {
        return confirmation.confirm(orderId, body);
    }

    @PostMapping("/shipments/{orderId}/box/check")
    @Operation(summary = "«Упаковано» before it is pressed: what would stop the waybill for this box (no NP call)")
    public Check checkBox(@PathVariable String orderId, @RequestBody ConfirmBox body) {
        return confirmation.check(orderId, body);
    }

    @GetMapping("/packing/journal")
    @Operation(summary = "«Журнал упаковки»: recent waybills (≤ 60 days, ≤ 100) with the box and NP's re-measure")
    public PackingJournal.Journal journal(@RequestParam(required = false) Integer days,
                                          @RequestParam(required = false) Integer limit) {
        return journal.recent(days, limit);
    }
}
