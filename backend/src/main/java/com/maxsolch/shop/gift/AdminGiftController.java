package com.maxsolch.shop.gift;

import com.maxsolch.shop.gift.GiftDtos.AutofillDto;
import com.maxsolch.shop.gift.GiftDtos.AutofillRequest;
import com.maxsolch.shop.gift.GiftDtos.CaseDraftRequest;
import com.maxsolch.shop.gift.GiftDtos.CaseItemAdminDto;
import com.maxsolch.shop.gift.GiftDtos.DraftItemDto;
import com.maxsolch.shop.gift.GiftDtos.CaseItemRequest;
import com.maxsolch.shop.gift.GiftDtos.GiftStatsDto;
import com.maxsolch.shop.gift.GiftDtos.TestDrawDto;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
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
    private final GiftService giftService;
    private final CaseAutofill autofill;

    public AdminGiftController(AdminGiftService service, GiftService giftService, CaseAutofill autofill) {
        this.service = service;
        this.giftService = giftService;
        this.autofill = autofill;
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

    @PostMapping("/tiers/{tier}/test-draw")
    @Operation(summary = "«Тест кейса»: draw the tier N times (1…10 000) like the checkout; nothing is saved")
    public TestDrawDto testDraw(@PathVariable String tier, @RequestParam(defaultValue = "1") int count,
                                @RequestBody(required = false) CaseDraftRequest body) {
        return body == null || body.items() == null ? giftService.testDraw(tier, count)
                : giftService.testDraw(tier, count, body.items());
    }

    @PutMapping("/tiers/{tier}/items")
    @Operation(summary = "«Опубликовать» the case builder's draft: the tier's prizes become exactly these, at once")
    public List<CaseItemAdminDto> replaceItems(@PathVariable String tier, @RequestBody CaseDraftRequest body) {
        return service.replaceItems(tier, body == null ? null : body.items());
    }

    @PostMapping("/tiers/{tier}/autofill")
    @Operation(summary = "«Автособрать»: a draft of prizes and chances for the tier from the catalog (nothing is saved)")
    public AutofillDto autofill(@PathVariable String tier, @RequestBody(required = false) AutofillRequest body) {
        return autofill.autofill(tier, body);
    }

    @GetMapping("/tiers/{tier}/alternatives")
    @Operation(summary = "Products that fit a rarity of the tier by price (replacing a prize in the builder)")
    public List<DraftItemDto> alternatives(@PathVariable String tier, @RequestParam String rarity,
                                           @RequestParam(required = false) List<String> exclude) {
        return autofill.alternatives(tier, rarity, exclude == null ? List.of() : exclude);
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
