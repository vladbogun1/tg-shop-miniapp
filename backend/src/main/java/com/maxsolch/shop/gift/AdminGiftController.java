package com.maxsolch.shop.gift;

import com.maxsolch.shop.gift.GiftDtos.CaseItemAdminDto;
import com.maxsolch.shop.gift.GiftDtos.CaseItemRequest;
import com.maxsolch.shop.gift.GiftDtos.GiftStatsDto;
import com.maxsolch.shop.gift.GiftDtos.TierAdminDto;
import com.maxsolch.shop.gift.GiftDtos.TierRequest;
import com.maxsolch.shop.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The gift case in the admin: prizes with chances and the numbers. Settings (gift.*) —
 * /api/admin/settings; giving a case to an order — POST /api/admin/orders/{id}/gift-case.
 */
@RestController
@RequestMapping("/api/admin/gift")
@RequiredAdmin
@Tag(name = "Admin Gift", description = "Gift for the order sum: case prizes, stats")
@SecurityRequirement(name = "bearer-jwt")
public class AdminGiftController {

    private final AdminGiftService service;

    public AdminGiftController(AdminGiftService service) {
        this.service = service;
    }

    @GetMapping("/tiers")
    @Operation(summary = "Case tiers (bronze / silver / gold): thresholds, guaranteed discount, swap percent")
    public List<TierAdminDto> tiers() {
        return service.tiers();
    }

    @PatchMapping("/tiers/{tier}")
    @Operation(summary = "Change a case tier")
    public TierAdminDto updateTier(@PathVariable String tier, @RequestBody TierRequest body) {
        return service.updateTier(tier, body);
    }

    @GetMapping("/case-items")
    @Operation(summary = "Prizes of every tier with their current chances (per tier)")
    public List<CaseItemAdminDto> caseItems() {
        return service.caseItems();
    }

    @PostMapping("/case-items")
    @Operation(summary = "Add a prize to the gift case")
    public CaseItemAdminDto addCaseItem(@RequestBody CaseItemRequest body) {
        return service.addCaseItem(body);
    }

    @PatchMapping("/case-items/{id}")
    @Operation(summary = "Change rarity / weight / order / on-off of a prize")
    public CaseItemAdminDto updateCaseItem(@PathVariable long id, @RequestBody CaseItemRequest body) {
        return service.updateCaseItem(id, body);
    }

    @DeleteMapping("/case-items/{id}")
    @Operation(summary = "Remove a prize from the gift case")
    public void deleteCaseItem(@PathVariable long id) {
        service.deleteCaseItem(id);
    }

    @GetMapping("/stats")
    @Operation(summary = "Last 30 days: orders with an automatic gift, with a case, cases opened")
    public GiftStatsDto stats() {
        return service.stats();
    }
}
