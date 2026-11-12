package com.maxsolch.shop.delivery.api;

import com.maxsolch.shop.delivery.app.NpBoxAdmin;
import com.maxsolch.shop.delivery.app.NpBoxAdmin.BoxEdit;
import com.maxsolch.shop.delivery.app.NpBoxAdmin.BoxList;
import com.maxsolch.shop.delivery.app.NpBoxAdmin.BoxView;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** «Коробки»: the Nova Poshta box catalog and our own boxes — in stock, sides, fold heights, tare, price. */
@RestController
@RequestMapping("/api/admin/np/boxes")
@RequiredAdmin
@Tag(name = "Admin NP boxes", description = "Box catalog used to suggest and confirm the parcel's box")
@SecurityRequirement(name = "bearer-jwt")
public class AdminNpBoxController {

    private final NpBoxAdmin boxes;

    public AdminNpBoxController(NpBoxAdmin boxes) {
        this.boxes = boxes;
    }

    @GetMapping
    @Operation(summary = "Every box with its fold heights, and whether the list was reviewed")
    public BoxList list() {
        return boxes.list();
    }

    @PostMapping
    @Operation(summary = "Add our own box (in stock)")
    public BoxView create(@RequestBody BoxEdit body) {
        return boxes.create(body);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Change a box (null fields stay); setting the price clears «примерная цена»")
    public BoxView update(@PathVariable String id, @RequestBody BoxEdit body) {
        return boxes.update(id, body);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete our own box (catalog boxes are only taken out of stock)")
    public void delete(@PathVariable String id) {
        boxes.delete(id);
    }

    @PostMapping("/reviewed")
    @Operation(summary = "«Готово»: the list was reviewed (novaposhta.boxesReviewed = true)")
    public BoxList reviewed() {
        return boxes.markReviewed();
    }
}
