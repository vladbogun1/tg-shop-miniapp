package com.maxsolch.shop.returns.api;

import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.returns.app.AdminReturns;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Putting a written-off unit back is a returns scenario (a defect of a return becomes a restocked unit of that
 * return), so it lives here; the URL stays under the write-offs report of the stock page.
 */
@RestController
@RequestMapping("/api/admin/stock-writeoffs")
@RequiredAdmin
@Tag(name = "Admin Stock Writeoffs", description = "Stock that left the shelf without a sale")
@SecurityRequirement(name = "bearer-jwt")
public class AdminWriteoffRestoreController {

    private final AdminReturns adminReturns;

    public AdminWriteoffRestoreController(AdminReturns adminReturns) {
        this.adminReturns = adminReturns;
    }

    @PostMapping("/{id}/restore")
    @Operation(summary = "Written off by mistake: put units back on the shelf (the write-off is kept, marked)")
    public Map<String, String> restore(@PathVariable long id, @Valid @RequestBody ReturnDtos.RestoreWriteoffRequest req) {
        return Map.of("summary", adminReturns.restoreWriteoff(id, req.quantity(), req.note()));
    }
}
